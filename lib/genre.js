import { sql } from "./db.js";

export const CANONICAL_GENRES = ["rock", "pop", "alternative", "rap", "metal", "hardcore", "punk", "electronic", "dance"];

// In-memory keyword cache (refreshed on first call per process)
let keywordCache = null;

async function getKeywordMap() {
  if (keywordCache) return keywordCache;
  const { rows } = await sql`SELECT keyword, canonical_genre FROM genre_keywords`;
  keywordCache = new Map(rows.map((r) => [r.keyword.toLowerCase(), r.canonical_genre]));
  return keywordCache;
}

// Invalidate the in-memory cache (e.g. after keyword table update)
export function invalidateGenreCache() {
  keywordCache = null;
}

/**
 * Given an array of Spotify artist genre strings (e.g. ["indie rock", "shoegaze"]),
 * return an array of matched canonical genres (deduplicated).
 */
export async function classifyGenres(artistGenres) {
  if (!artistGenres?.length) return [];
  const map = await getKeywordMap();
  const matched = new Set();

  for (const genre of artistGenres) {
    const lower = genre.toLowerCase();
    // Exact match first
    if (map.has(lower)) {
      matched.add(map.get(lower));
      continue;
    }
    // Substring match: check if any keyword appears in this genre string
    for (const [kw, canonical] of map.entries()) {
      if (lower.includes(kw)) {
        matched.add(canonical);
      }
    }
  }

  return [...matched];
}

/**
 * Synchronous classification using a pre-loaded keyword map (for batch processing).
 */
export function classifyGenresSync(artistGenres, map) {
  if (!artistGenres?.length) return [];
  const matched = new Set();
  for (const genre of artistGenres) {
    const lower = genre.toLowerCase();
    if (map.has(lower)) { matched.add(map.get(lower)); continue; }
    for (const [kw, canonical] of map.entries()) {
      if (lower.includes(kw)) matched.add(canonical);
    }
  }
  return [...matched];
}

export async function loadKeywordMap() {
  return getKeywordMap();
}
