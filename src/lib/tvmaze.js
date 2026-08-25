// TVmaze API client — single external data source for Framory.
// Public, key-less API: https://api.tvmaze.com

const BASE = "https://api.tvmaze.com";

const memCache = {
  pool: null,
  poolTime: 0,
  schedule: null,
  scheduleTime: 0,
  detail: {},
};

const POOL_TTL = 1000 * 60 * 60;
const SCHEDULE_TTL = 1000 * 60 * 20;
const DETAIL_TTL = 1000 * 60 * 60 * 6;

export function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, "").trim();
}

// Classify a TVmaze show into Framory's internal category.
// Anime is identified by the "Anime" genre; everything else from TVmaze is a TV series.
// Films are created manually (TVmaze is TV-focused).
export function classifyShow(show) {
  const genres = show?.genres || [];
  if (genres.some((g) => g.toLowerCase() === "anime")) return "ANIME";
  return "TV_SERIES";
}

function normalizeShow(show) {
  if (!show) return null;
  return {
    tvmaze_id: show.id,
    title: show.name || "Untitled",
    original_title: show.name || "",
    summary: stripHtml(show.summary),
    poster_url: show.image?.medium || show.image?.original || "",
    backdrop_url: show.image?.original || show.image?.medium || "",
    genres: show.genres || [],
    year: show.premiered ? parseInt(show.premiered.slice(0, 4), 10) : null,
    status: show.status || "",
    network: show.network?.name || show.webChannel?.name || "",
    type: show.type || "",
    rating: show.rating?.average || 0,
    language: show.language || "",
    country: show.network?.country?.name || show.webChannel?.country?.name || "",
    release_date: show.premiered || "",
    weight: show.weight || 0,
    content_type: classifyShow(show),
    source: "TVMAZE",
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TVmaze request failed (${res.status})`);
  return res.json();
}

export async function searchShows(query) {
  const q = query.trim();
  if (!q) return [];
  const data = await fetchJson(`${BASE}/search/shows?q=${encodeURIComponent(q)}`);
  return data
    .map((item) => normalizeShow(item.show))
    .filter(Boolean)
    .filter((s) => s.tvmaze_id);
}

export async function getShowPool() {
  const now = Date.now();
  if (memCache.pool && now - memCache.poolTime < POOL_TTL) return memCache.pool;
  const pages = await Promise.all([0, 1, 2, 3].map((p) => fetchJson(`${BASE}/shows?page=${p}`)));
  const shows = pages.flat().map(normalizeShow).filter(Boolean);
  memCache.pool = shows;
  memCache.poolTime = now;
  return shows;
}

export async function getScheduleToday() {
  const now = Date.now();
  if (memCache.schedule && now - memCache.scheduleTime < SCHEDULE_TTL) return memCache.schedule;
  const today = new Date().toISOString().slice(0, 10);
  const data = await fetchJson(`${BASE}/schedule?date=${today}`);
  const map = {};
  data.forEach((ep) => {
    if (ep.show && ep.show.id && !map[ep.show.id]) {
      map[ep.show.id] = normalizeShow(ep.show);
    }
  });
  const shows = Object.values(map).filter(Boolean);
  memCache.schedule = shows;
  memCache.scheduleTime = now;
  return shows;
}

export async function getShowDetail(id) {
  const key = String(id);
  const now = Date.now();
  if (memCache.detail[key] && now - memCache.detail[key].time < DETAIL_TTL) {
    return memCache.detail[key].data;
  }
  const data = await fetchJson(`${BASE}/shows/${key}?embed[]=seasons&embed[]=episodes`);
  const show = normalizeShow(data);
  const seasonsRaw = data._embedded?.seasons || [];
  const episodesRaw = data._embedded?.episodes || [];

  const seasons = seasonsRaw
    .map((se) => ({
      tvmaze_id: se.id,
      season_number: se.number,
      title: se.name || "",
      episode_count: episodesRaw.filter((e) => e.season === se.number).length,
      poster_url: se.image?.medium || "",
    }))
    .filter((se) => se.season_number > 0);

  const episodes = episodesRaw
    .filter((e) => e.season > 0)
    .map((e) => ({
      tvmaze_id: e.id,
      season_number: e.season,
      episode_number: e.number,
      title: e.name || `Episode ${e.number}`,
      description: stripHtml(e.summary),
      airdate: e.airdate || "",
      runtime: e.runtime || 0,
      image_url: e.image?.medium || "",
    }));

  show.total_seasons = seasons.length;
  show.total_episodes = episodes.length;

  const result = { show, seasons, episodes };
  memCache.detail[key] = { time: now, data: result };
  return result;
}

export function getDiscoverySections(pool, schedule) {
  const byId = new Map();
  pool.forEach((s) => byId.set(s.tvmaze_id, s));
  schedule.forEach((s) => {
    if (!byId.has(s.tvmaze_id)) byId.set(s.tvmaze_id, s);
  });
  const all = Array.from(byId.values());

  const trending = [...schedule].sort((a, b) => b.weight - a.weight).slice(0, 20);

  const popular = [...all].sort((a, b) => b.weight - a.weight).slice(0, 20);

  const topRated = [...all]
    .filter((s) => s.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 20);

  const genreMap = {};
  all.forEach((s) => {
    s.genres.forEach((g) => {
      if (!genreMap[g]) genreMap[g] = [];
      genreMap[g].push(s);
    });
  });
  const genres = Object.keys(genreMap)
    .sort((a, b) => genreMap[b].length - genreMap[a].length)
    .slice(0, 8)
    .map((g) => ({
      name: g,
      shows: [...genreMap[g]].sort((a, b) => b.weight - a.weight).slice(0, 20),
    }));

  return { trending, popular, topRated, genres };
}