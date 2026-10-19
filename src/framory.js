import Dexie from "dexie";
import { z } from "zod";

const db = new Dexie("framory");
db.version(1).stores({ franchises: "id, updatedAt", entries: "franchiseId, updatedAt", meta: "key" });
export { db };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HTML_ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"', "&mdash;": "-", "&ndash;": "-", "&hellip;": "..." };
function stripHtml(s) {
  if (s == null) return "";
  let out = String(s);
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/?(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, "\n");
  out = out.replace(/<[^>]*>/g, "");
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  out = out.replace(/&[a-z]+;|&#[0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? " ");
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

const jikanAnimeSchema = z.object({
  mal_id: z.number(),
  title: z.string().catch(""),
  title_english: z.string().nullish().catch(null),
  title_japanese: z.string().nullish().catch(null),
  title_synonyms: z.array(z.string()).catch([]),
  images: z.any().catch(null),
  synopsis: z.string().nullish().catch(null),
  aired: z.any().catch(null),
  airing: z.boolean().catch(false),
  episodes: z.number().nullish().catch(null),
  duration: z.string().nullish().catch(null),
  score: z.number().nullish().catch(null),
  members: z.number().nullish().catch(null),
  status: z.string().nullish().catch(null),
  year: z.number().nullish().catch(null),
  type: z.string().nullish().catch(null),
  genres: z.array(z.object({ name: z.string() })).catch([]),
  studios: z.array(z.object({ name: z.string() })).catch([]),
});

const alMediaSchema = z.object({
  id: z.number(),
  idMal: z.number().nullish().catch(null),
  title: z.object({ romaji: z.string().nullish().catch(null), english: z.string().nullish().catch(null), native: z.string().nullish().catch(null), userPreferred: z.string().nullish().catch(null) }).catch({}),
  coverImage: z.object({ large: z.string().nullish().catch(null), medium: z.string().nullish().catch(null) }).catch({}),
  bannerImage: z.string().nullish().catch(null),
  description: z.string().nullish().catch(null),
  startDate: z.object({ year: z.number().nullish().catch(null) }).nullish().catch(null),
  endDate: z.object({ year: z.number().nullish().catch(null) }).nullish().catch(null),
  episodes: z.number().nullish().catch(null),
  duration: z.number().nullish().catch(null),
  averageScore: z.number().nullish().catch(null),
  favourites: z.number().nullish().catch(null),
  format: z.string().nullish().catch(null),
  status: z.string().nullish().catch(null),
  season: z.string().nullish().catch(null),
  seasonYear: z.number().nullish().catch(null),
  nextAiringEpisode: z.object({ episode: z.number(), airingAt: z.number() }).nullish().catch(null),
  genres: z.array(z.string()).catch([]),
  studios: z.object({ nodes: z.array(z.object({ name: z.string() })).catch([]) }).catch({ nodes: [] }),
  relations: z.any().catch(null),
});

const AL_FIELDS = `id idMal title{romaji english native userPreferred} coverImage{large medium} bannerImage description startDate{year} endDate{year} episodes duration averageScore favourites format status season seasonYear nextAiringEpisode{episode airingAt} genres studios{nodes{name}}`;

const isAbort = (e) => !!e && (e.name === "AbortError" || e.code === 20);
const rethrowAbort = (e) => { if (isAbort(e)) throw e; };

async function apiFetch(url, init = {}, { ms = 9000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const relay = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", relay, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (e?.name === "AbortError") throw new Error("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}

let lastJikanCall = 0;
async function jikanFetch(path, signal) {
  const gap = Date.now() - lastJikanCall;
  if (gap < 400) await sleep(400 - gap);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  lastJikanCall = Date.now();
  const res = await apiFetch(`https://api.jikan.moe/v4${path}`, {}, { ms: 6000, signal });
  if (!res.ok) throw new Error(`jikan ${res.status}`);
  return res.json();
}
async function alQuery(query, variables, signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const res = await apiFetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }, { ms: 9000, signal });
  if (!res.ok) throw new Error(`anilist ${res.status}`);
  return res.json();
}
const AL_SEARCH = `query($q:String){Page(page:1,perPage:25){media(search:$q,type:ANIME,sort:SEARCH_MATCH){${AL_FIELDS}}}}`;
const AL_BY_MAL = `query($ids:[Int]){Page(page:1,perPage:50){media(idMal_in:$ids,type:ANIME){${AL_FIELDS}}}}`;
const AL_BY_IDS = `query($ids:[Int]){Page(page:1,perPage:50){media(id_in:$ids,type:ANIME){${AL_FIELDS}}}}`;

function parseDuration(t) {
  if (!t) return null;
  const m = /(\d+)\s*min/.exec(t);
  return m ? Number(m[1]) : null;
}
function jikanToMedia(a) {
  const p = jikanAnimeSchema.safeParse(a);
  if (!p.success) return null;
  const m = p.data;
  const malId = m?.mal_id;
  if (!malId) return null;
  const images = m.images?.webp?.large_image_url || m.images?.jpg?.large_image_url || "";
  const titles = [m.title, m.title_english, m.title_japanese, ...(m.title_synonyms || [])].filter(Boolean);
  const year = m.year || m.aired?.prop?.from?.year || null;
  const title = (m.title_english || m.title || titles[0] || "").trim();
  if (!title) return null;
  const airedFrom = m.aired?.from ? Date.parse(m.aired.from) : null;
  const airedTo = m.aired?.to ? Date.parse(m.aired.to) : null;
  return {
    id: `m${malId}`, malId, alId: null, source: "mal", titles,
    title, cover: images || "", banner: "",
    synopsis: stripHtml(m.synopsis) || "", year, score: m.score ?? null, members: m.members ?? 0,
    format: m.type || "", status: m.status || "", episodes: Number.isFinite(m.episodes) ? m.episodes : null,
    durationMin: parseDuration(m.duration), airedFrom: Number.isFinite(airedFrom) ? airedFrom : null,
    airedTo: Number.isFinite(airedTo) ? airedTo : null,
    airing: !!m.airing, genres: (m.genres || []).map((g) => g?.name).filter(Boolean),
    nextAiring: null,
  };
}
function alToMedia(a) {
  const p = alMediaSchema.safeParse(a);
  if (!p.success) return null;
  const m = p.data;
  const alId = m?.id;
  if (!alId) return null;
  const malId = m.idMal ?? null;
  const cover = m.coverImage?.large || m.coverImage?.medium || "";
  const titles = [m.title?.english, m.title?.userPreferred, m.title?.romaji, m.title?.native].filter(Boolean);
  const year = m.seasonYear || m.startDate?.year || m.endDate?.year || null;
  const title = (m.title?.english || m.title?.userPreferred || m.title?.romaji || titles[0] || "").trim();
  if (!title) return null;
  return {
    id: malId ? `m${malId}` : `a${alId}`, malId, alId, source: "al", titles,
    title, cover: cover || "", banner: m.bannerImage || "",
    synopsis: stripHtml(m.description) || "", year, score: m.averageScore ? m.averageScore / 10 : null, members: m.favourites ?? 0,
    format: m.format || "", status: m.status || "", episodes: Number.isFinite(m.episodes) ? m.episodes : null,
    durationMin: m.duration || null, airedFrom: null, airedTo: null,
    airing: m.status === "RELEASING", genres: Array.isArray(m.genres) ? m.genres.filter(Boolean) : [],
    nextAiring: m.nextAiringEpisode?.airingAt ? { ep: m.nextAiringEpisode.episode ?? null, at: m.nextAiringEpisode.airingAt * 1000 } : null,
  };
}
const isMedia = (m) => !!m && typeof m.id === "string" && !!m.id.trim() && typeof m.title === "string" && !!m.title.trim();
const cleanMedia = (arr) => (Array.isArray(arr) ? arr.filter(isMedia) : []);

async function jikanSearch(q, signal) {
  const json = await jikanFetch(`/anime?q=${encodeURIComponent(q)}&limit=15&sfw=true&order_by=members&sort=desc`, signal);
  const raw = json?.data;
  return cleanMedia((Array.isArray(raw) ? raw : []).map(jikanToMedia));
}
async function alSearch(q, signal) {
  const json = await alQuery(AL_SEARCH, { q }, signal);
  const raw = json?.data?.Page?.media;
  return cleanMedia((Array.isArray(raw) ? raw : []).map(alToMedia));
}

// Prima risposta NON vuota vince; se tutte falliscono/vuote -> []. Non lancia mai
// (tranne cancellazione). Così bloccare un provider non blocca la ricerca.
function raceNonEmpty(tasks) {
  return new Promise((resolve) => {
    let pending = tasks.length;
    let settled = false;
    let errored = 0;
    const finish = (media, failed) => { if (!settled) { settled = true; resolve({ media, failed }); } };
    if (!pending) return finish([], false);
    for (const task of tasks) {
      Promise.resolve(task)
        .then((res) => { if (Array.isArray(res) && res.length) finish(res, false); else if (--pending === 0) finish([], errored === tasks.length); })
        .catch(() => { errored += 1; if (--pending === 0) finish([], errored === tasks.length); });
    }
  });
}

// Jikan v4 REST (GET semplice, nessun header custom -> preflight-free) in parallelo
// ad AniList GraphQL: qualunque risponda per primo con risultati vince. Non lancia mai.
async function providerSearch(q, signal) {
  if (!q || !q.trim()) return { media: [], failed: false };
  return raceNonEmpty([
    jikanSearch(q, signal).catch((e) => { if (!isAbort(e)) console.warn("[api] jikan search", e); throw e; }),
    alSearch(q, signal).catch((e) => { if (!isAbort(e)) console.warn("[api] anilist search", e); throw e; }),
  ]);
}
async function providerGetMedia(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const mal = [], al = [];
  for (const id of uniq) { if (/^m\d+$/.test(id)) mal.push(Number(id.slice(1))); else if (/^a\d+$/.test(id)) al.push(Number(id.slice(1))); }
  const out = new Map();
  const push = (m) => { if (m) out.set(m.id, m); };
  try {
    for (const c of chunk(mal, 50)) { const json = await alQuery(AL_BY_MAL, { ids: c }); const raw = json?.data?.Page?.media; for (const x of Array.isArray(raw) ? raw : []) push(alToMedia(x)); }
    for (const c of chunk(al, 50)) { const json = await alQuery(AL_BY_IDS, { ids: c }); const raw = json?.data?.Page?.media; for (const x of Array.isArray(raw) ? raw : []) push(alToMedia(x)); }
  } catch (e) { console.warn("[api] al batch fail", e); }
  for (const n of mal) if (!out.has(`m${n}`)) { try { const json = await jikanFetch(`/anime/${n}`); push(jikanToMedia(json?.data)); } catch (e) { console.warn("[api] jikan fallback fail", n, e); } }
  return [...out.values()];
}

const IGNORE_TITLE_RE = /\b(recap|teaser|pv|cm|trailer|digest|special episode|previews?)\b/i;
function isIgnoredEpisode(ep) {
  if (ep.recap) return true;
  if (ep.durationMin != null && ep.durationMin < 3) return true;
  if (IGNORE_TITLE_RE.test(ep.title || "")) return true;
  return false;
}
function filmEpisode(med, n, extra = {}) {
  return { id: `${med.id}:m`, n, title: med.title || "Film", durationMin: med.durationMin || 90, recap: false, thumb: "", ...extra };
}
const SINGLE_FMT_RE = /MOVIE|FILM/;
const EP_TITLE_RE = /^\s*(?:episode|ep\.?|e)\s*(\d+)\s*(?:[-–—:]\s*(.*))?$/i;

function parseStreamTitle(t) {
  const m = EP_TITLE_RE.exec(String(t || "").trim());
  if (m) return { n: Number(m[1]), title: (m[2] || "").trim() };
  return { n: null, title: String(t || "").trim() };
}

function streamToEpisodes(stream, med) {
  const list = (stream && stream.list) || [];
  const fmt = String(med.format || "").toUpperCase();
  const parsed = list
    .map((s, i) => { const p = parseStreamTitle(s.title); return { n: p.n || i + 1, title: p.title, thumb: s.thumbnail || s.thumb || "", site: s.site || "" }; })
    .filter((x) => x.n > 0)
    .sort((a, b) => a.n - b.n);
  const total = med.episodes || parsed.length || 0;
  if (SINGLE_FMT_RE.test(fmt)) {
    return [filmEpisode(med, 1, { title: med.title || "Film", thumb: "", durationMin: med.durationMin || 90 })];
  }
  if (total <= 1) {
    const s = parsed[0];
    return [filmEpisode(med, 1, { title: (s && s.title) || med.title || "Film", thumb: (s && s.thumb) || "", durationMin: med.durationMin || 90 })];
  }
  const out = [];
  const seen = new Set();
  for (const s of parsed) {
    if (total > 0 && s.n > total) continue;
    if (seen.has(s.n)) continue;
    seen.add(s.n);
    out.push({ id: `${med.id}:e${s.n}`, n: s.n, title: s.title || `Episodio ${s.n}`, thumb: s.thumb || "", durationMin: med.durationMin || null, recap: false, site: s.site || "" });
  }
  for (let n = 1; n <= total; n++) {
    if (seen.has(n)) continue;
    out.push({ id: `${med.id}:e${n}`, n, title: `Episodio ${n}`, thumb: "", durationMin: med.durationMin || null, recap: false, site: "" });
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}

const AL_STREAM_FIELDS = `id idMal episodes format duration streamingEpisodes{title thumbnail site}`;
const AL_STREAM_MAL = `query($ids:[Int]){Page(page:1,perPage:50){media(idMal_in:$ids,type:ANIME){${AL_STREAM_FIELDS}}}}`;
const AL_STREAM_ID = `query($ids:[Int]){Page(page:1,perPage:50){media(id_in:$ids,type:ANIME){${AL_STREAM_FIELDS}}}}`;

async function alStreamBatch(ids) {
  const out = new Map();
  const mal = [], al = [];
  for (const id of new Set((ids || []).filter(Boolean))) {
    if (/^m\d+$/.test(id)) mal.push(Number(id.slice(1)));
    else if (/^a\d+$/.test(id)) al.push(Number(id.slice(1)));
  }
  const ingest = (json) => {
    for (const m of json?.data?.Page?.media || []) {
      out.set(m.idMal ? `m${m.idMal}` : `a${m.id}`, {
        list: m.streamingEpisodes || [], episodes: m.episodes, durationMin: m.duration, format: m.format,
      });
    }
  };
  for (const c of chunk(mal, 50)) {
    try { ingest(await alQuery(AL_STREAM_MAL, { ids: c })); } catch (e) { console.warn("[stream] mal batch", e); }
  }
  for (const c of chunk(al, 50)) {
    try { ingest(await alQuery(AL_STREAM_ID, { ids: c })); } catch (e) { console.warn("[stream] id batch", e); }
  }
  return out;
}

async function jikanEpisodes(med) {
  if (!med?.malId) return [];
  const out = [];
  if (!med.episodes || med.episodes > 50) {
    if (med.nextAiring) for (let i = 1; i <= med.nextAiring.ep; i++) out.push(filmEpisode(med, i));
    return out;
  }
  let page = 1;
  try {
    while (page <= 15 && (!med.episodes || out.length < med.episodes)) {
      const json = await jikanFetch(`/anime/${med.malId}/episodes?page=${page}`);
      for (const raw of json?.data || []) {
        const n = Number(raw.mal_id);
        const title = raw.title || `Episodio ${n}`;
        const ep = { n, title, durationMin: raw.duration ? Number(String(raw.duration).match(/\d+/)?.[0]) : null, recap: !!raw.recap, thumb: "" };
        if (!isIgnoredEpisode(ep)) out.push({ ...ep, id: `${med.id}:e${n}` });
      }
      if (!json?.pagination?.has_next_page) break;
      page++;
    }
  } catch {}
  return out;
}

function synthesizedEpisodes(med) {
  const fmt = String(med.format || "").toUpperCase();
  const total = med.episodes || (med.nextAiring ? med.nextAiring.ep : 0);
  if (!total && SINGLE_FMT_RE.test(fmt)) return [filmEpisode(med, 1)];
  const out = [];
  for (let i = 1; i <= total; i++) out.push({ id: `${med.id}:e${i}`, n: i, title: `Episodio ${i}`, durationMin: med.durationMin, recap: false, thumb: med.banner || "" });
  return out;
}

async function loadPartEpisodes(med, streams) {
  if (!med) return [];
  const st = streams instanceof Map ? streams.get(med.id) : streams;
  if (st && (st.list || []).length) {
    const eps = streamToEpisodes(st, med);
    if (eps.length) return eps;
  }
  if (med.malId) {
    const eps = await jikanEpisodes(med);
    if (eps.length) return eps;
  }
  return synthesizedEpisodes(med);
}

async function loadAllEpisodes(parts) {
  const meds = (parts || []).map((p) => p.media || mediaFromPart(p));
  let streams = new Map();
  try { streams = await alStreamBatch(meds.map((m) => m.id)); } catch (e) { console.warn("[stream] batch fail", e); }
  for (let i = 0; i < (parts || []).length; i++) {
    const p = parts[i], m = meds[i];
    let eps = [];
    try { eps = await loadPartEpisodes(m, streams); } catch {}
    if (!eps.length) eps = defaultEpisodes(p);
    p.episodesList = eps;
    p.episodesLoaded = true;
  }
  return parts;
}

function defaultEpisodes(p) {
  const m = p.media || {};
  const fmt = String(m.format || "").toUpperCase();
  const hero = m.banner || p.cover || "";
  if (/MOVIE|FILM|OVA|ONA|SPECIAL/.test(fmt)) {
    return [filmEpisode({ ...m, id: p.id, title: p.title, durationMin: p.durationMin }, 1, { thumb: hero })];
  }
  const total = p.episodes || m.episodes || 0;
  const out = [];
  for (let i = 1; i <= total; i++) out.push({ id: `${p.id}:e${i}`, n: i, title: `Episodio ${i}`, durationMin: p.durationMin, recap: false, thumb: hero });
  if (!out.length) return [filmEpisode({ ...m, id: p.id, title: p.title, durationMin: p.durationMin }, 1, { thumb: hero })];
  return out;
}

const STOP_WORDS = new Set(["tv", "tvs", "season", "seasons", "series", "part", "parts", "cour", "cours", "final", "finals", "ova", "ovas", "oad", "oads", "ona", "onas", "movie", "movies", "film", "films", "special", "specials", "episode", "episodes", "ep", "eps", "vol", "volume", "volumes", "org", "original", "extra", "extras", "stage", "stages", "ver", "version", "arc", "season1", "season2"]);
const ORDINAL_RE = /^\d+(?:st|nd|rd|th)?$/i;
function titleKey(t) {
  let s = (t || "").toLowerCase();
  s = s.replace(/[\[\(\{][^\]\)\}]*[\]\)\}]/g, " ");
  s = s.split(/\s+[-–—]\s+|\s+:\s+/)[0];
  s = s.replace(/[^\p{L}\p{N}]+/gu, " ");
  const filtered = s.split(" ").filter((w) => w && !STOP_WORDS.has(w) && !ORDINAL_RE.test(w)).join(" ").trim();
  return filtered || s.trim();
}
function allKeys(m) {
  const set = new Set();
  const titles = (Array.isArray(m?.titles) && m.titles.length ? m.titles : [m?.title]).filter(Boolean);
  for (const t of titles) { const k = titleKey(t); if (k && k.length > 1) set.add(k); }
  return [...set];
}
const groupScore = (m) => (m?.members || m?.score || 0) + (m?.malId ? 0 : -1e6);
const cmpChron = (a, b) => { const A = a?.airedFrom || a?.year || 9999, B = b?.airedFrom || b?.year || 9999; if (A !== B) return A - B; return a?.year || b?.year || 9999; };

const ALLOWED_REL = new Set(["SEQUEL", "PREQUEL", "SIDE_STORY", "SUMMARY", "ALTERNATIVE", "ALTERNATIVE_VERSION", "PARENT", "FULL_STORY", "SPIN_OFF"]);
const NON_ANIME_FORMAT = new Set(["MANGA", "NOVEL", "ONE_SHOT", "MANHUA", "MANHWA", "WEB_NOVEL", "LIGHT_NOVEL", "NOVEL_SPECIAL"]);
const isAnimeNode = (n) => !n || !n.format || !NON_ANIME_FORMAT.has(String(n.format).toUpperCase());

const REL_FIELDS = `id idMal title{romaji english native userPreferred} coverImage{large medium} bannerImage description startDate{year} endDate{year} episodes duration averageScore favourites format status seasonYear genres`;
const AL_REL_MAL = `query($ids:[Int]){Page(page:1,perPage:50){media(idMal_in:$ids,type:ANIME){${REL_FIELDS} relations{edges{relationType node{${REL_FIELDS}}}}}}}`;
const AL_REL_ID = `query($ids:[Int]){Page(page:1,perPage:50){media(id_in:$ids,type:ANIME){${REL_FIELDS} relations{edges{relationType node{${REL_FIELDS}}}}}}}`;

async function alRelBatch(malIds, alIds, signal) {
  const out = new Map();
  const collect = (json) => {
    const raw = json?.data?.Page?.media;
    for (const m of Array.isArray(raw) ? raw : []) {
      const mm = alToMedia(m);
      if (mm) out.set(mm.id, { media: mm, edges: Array.isArray(m?.relations?.edges) ? m.relations.edges : [] });
    }
  };
  for (const c of chunk([...new Set(malIds)], 50)) {
    try { collect(await alQuery(AL_REL_MAL, { ids: c }, signal)); }
    catch (e) { rethrowAbort(e); console.warn("[rel] mal batch", e); }
  }
  for (const c of chunk([...new Set(alIds)], 50)) {
    try { collect(await alQuery(AL_REL_ID, { ids: c }, signal)); }
    catch (e) { rethrowAbort(e); console.warn("[rel] id batch", e); }
  }
  return out;
}

async function discoverRelations(startMedia, opts = {}) {
  const maxDiscovered = opts.maxDiscovered ?? 40;
  const maxRounds = opts.maxRounds ?? 3;
  const deadline = Date.now() + (opts.budgetMs ?? 6000);
  const edges = new Map();
  const discovered = new Map();
  const sources = new Map();
  const visited = new Set();
  for (const m of startMedia) { if (!m?.id) continue; visited.add(m.id); sources.set(m.id, m); }
  let frontier = startMedia.filter((m) => m?.id);
  for (let round = 0; round < maxRounds && frontier.length; round++) {
    if (Date.now() > deadline) break;
    const malIds = [...new Set(frontier.map((m) => m.malId).filter(Boolean))];
    const alIds = [...new Set(frontier.filter((m) => !m.malId && m.alId).map((m) => m.alId))];
    if (!malIds.length && !alIds.length) break;
    const batch = await alRelBatch(malIds, alIds, opts.signal);
    const next = [];
    let stop = false;
    for (const [sid, payload] of batch) {
      if (!payload) continue;
      if (payload.media) sources.set(sid, payload.media);
      const set = edges.get(sid) || new Set();
      for (const edge of Array.isArray(payload.edges) ? payload.edges : []) {
        if (!edge || !ALLOWED_REL.has(edge.relationType)) continue;
        const node = edge.node;
        if (!isAnimeNode(node)) continue;
        const tm = alToMedia(node);
        if (!tm) continue;
        set.add(tm.id);
        if (!visited.has(tm.id)) { visited.add(tm.id); discovered.set(tm.id, tm); next.push(tm); }
        else if (!discovered.has(tm.id)) discovered.set(tm.id, tm);
        if (discovered.size >= maxDiscovered) { stop = true; break; }
      }
      edges.set(sid, set);
      if (stop) break;
    }
    if (stop) break;
    frontier = next;
  }
  return { edges, discovered: [...discovered.values()], sources };
}

function unionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  return { find, union };
}

function groupResults(results, edges) {
  const all = [];
  const idx = new Map();
  const add = (m) => { if (!isMedia(m) || idx.has(m.id)) return; idx.set(m.id, all.length); all.push(m); };
  for (const m of results || []) add(m);
  if (edges) for (const m of edges.discovered || []) add(m);
  if (!all.length) return [];

  const { find, union } = unionFind(all.length);
  const keyIdx = new Map();
  all.forEach((m, i) => { for (const k of allKeys(m)) { if (!k || keyIdx.has(k)) { if (k && keyIdx.has(k)) union(i, keyIdx.get(k)); continue; } keyIdx.set(k, i); } });
  if (edges && edges.edges instanceof Map) {
    for (const [sid, tgts] of edges.edges) {
      const si = idx.get(sid);
      if (si == null || !tgts) continue;
      for (const t of tgts) { const ti = idx.get(t); if (ti != null) union(si, ti); }
    }
  }

  const buckets = new Map();
  all.forEach((m, i) => { const r = find(i); if (!buckets.has(r)) buckets.set(r, []); buckets.get(r).push(m); });

  const out = [];
  for (const arr of buckets.values()) {
    if (!arr.length) continue;
    const sortedMembers = arr.slice().filter(isMedia).sort(cmpChron);
    const rep = arr.slice().filter(isMedia).sort((a, b) => groupScore(b) - groupScore(a))[0];
    if (!rep) continue;
    out.push({
      key: `${titleKey(rep.title)}:${rep.id}`,
      rep,
      memberIds: [...new Set(sortedMembers.map((m) => m.id))].filter(Boolean),
      preview: [...new Set(sortedMembers.map((m) => (m.format || "TV").toUpperCase()))].slice(0, 4),
      members: sortedMembers,
      title: rep.title, cover: rep.cover || "", synopsis: rep.synopsis || "", year: rep.year ?? null,
    });
  }
  return out
    .filter((g) => g.memberIds.length > 0)
    .sort((a, b) => (b.memberIds.length - a.memberIds.length) || (groupScore(b.rep) - groupScore(a.rep)));
}

async function searchGroupsDetailed(q, signal) {
  const { media, failed } = await providerSearch(q, signal);
  if (!media.length) return { groups: [], failed };
  let edges = { edges: new Map(), discovered: [] };
  try {
    edges = await discoverRelations(media, { maxRounds: 3, budgetMs: 6000, signal });
  } catch (e) {
    rethrowAbort(e);
    console.warn("[group] relations failed, using base results", e);
  }
  try {
    return { groups: groupResults(media, edges), failed: false };
  } catch (e) {
    console.warn("[group] grouping failed, using base results", e);
    return { groups: GroupFallback(media), failed: false };
  }
}

// Contratto pubblico: ritorna SEMPRE un array (mai lancia). Usato dai test/altri consumer.
async function searchGroups(q, signal) {
  try {
    return (await searchGroupsDetailed(q, signal)).groups;
  } catch (e) {
    if (isAbort(e)) throw e;
    console.warn("[search] failed", e);
    return [];
  }
}

function GroupFallback(media) {
  const out = [];
  for (const m of media || []) {
    if (!isMedia(m)) continue;
    out.push({
      key: `${titleKey(m.title)}:${m.id}`,
      rep: m,
      memberIds: [m.id],
      preview: [(m.format || "TV").toUpperCase()],
      members: [m],
      title: m.title, cover: m.cover || "", synopsis: m.synopsis || "", year: m.year ?? null,
    });
  }
  return out;
}

const frId = (meds, exp) => exp || `f:${Math.min(...meds.map((m) => m.malId || m.alId || 0))}`;
const compStatus = (s) => (s === "Finished" || s === "Finished Airing" || s === "FINISHED" ? "finished" : s === "Currently Airing" || s === "RELEASING" ? "airing" : s === "Not yet aired" || s === "NOT_YET_RELEASED" ? "upcoming" : "unknown");

const EXTRA_LABEL = { SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music", TV_SHORT: "TV Short" };
function planPart(m) {
  const fmt = String(m.format || "").toUpperCase();
  const isFilm = /MOVIE|FILM/.test(fmt);
  const isExtra = /OVA|ONA|SPECIAL|MUSIC|TV_SHORT/.test(fmt);
  const st = compStatus(m.status);
  return {
    id: m.id, title: m.title, kind: isFilm ? "film" : isExtra ? "extra" : "season",
    extraLabel: EXTRA_LABEL[fmt] || null, label: "",
    status: st, finished: st === "finished",
    airedFrom: m.airedFrom, year: m.year, durationMin: m.durationMin, cover: m.cover,
    episodes: m.episodes || (isFilm ? 1 : null), episodesLoaded: false,
    episodesList: null, media: m,
  };
}
function labelParts(parts) {
  let seasonN = 0;
  let filmN = 0;
  const filmCount = parts.filter((p) => p.kind === "film").length;
  const extraCounts = {};
  for (const p of parts) if (p.kind === "extra") { const b = p.extraLabel || "Extra"; extraCounts[b] = (extraCounts[b] || 0) + 1; }
  const extraSeen = {};
  return parts.map((p, i) => {
    let label = p.label;
    if (p.kind === "film") {
      filmN += 1;
      label = filmCount > 1 ? `Film ${filmN}` : "Film";
    } else if (p.kind === "extra") {
      const base = p.extraLabel || "Extra";
      extraSeen[base] = (extraSeen[base] || 0) + 1;
      label = extraCounts[base] > 1 ? `${base} ${extraSeen[base]}` : base;
    } else {
      seasonN += 1;
      label = `Stagione ${seasonN}`;
    }
    return { ...p, label, seq: i };
  });
}
function planParts(medias) {
  return labelParts((medias || []).filter(Boolean).slice().sort(cmpChron).map(planPart));
}
function buildFranchise(medias, title, exp) {
  const sorted = (medias || []).filter(Boolean).slice().sort(cmpChron);
  const parts = planParts(sorted);
  const allFinished = parts.every((p) => p.finished);
  return {
    id: frId(sorted, exp), title: title || (sorted[0]?.title || ""),
    cover: sorted[0]?.cover || "", banner: sorted.find((m) => m.banner)?.banner || "",
    synopsis: sorted[0]?.synopsis || "", year: sorted[0]?.year || null, score: sorted[0]?.score || null,
    status: allFinished ? "finished" : "airing", finished: allFinished,
    source: sorted[0]?.source || "mal",
    parts, memberIds: parts.map((p) => p.id),
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}
function previewParts(medias) { return planParts(medias); }

function optimisticFranchise(medias, title, exp) {
  const fr = buildFranchise(medias, title, exp);
  fr.parts = fr.parts.map((p) => {
    let eps = [];
    try { eps = synthesizedEpisodes(p.media || {}); } catch {}
    if (!eps.length) eps = defaultEpisodes(p);
    return { ...p, episodesList: eps, episodesLoaded: false, pending: true };
  });
  fr.pending = true;
  fr.createdAt = Date.now();
  fr.updatedAt = Date.now();
  return fr;
}

const defaultEntry = (id) => ({ franchiseId: id, status: null, checked: [], removed: [], order: [], partOrder: [], addedAt: Date.now(), updatedAt: Date.now() });

function orderedParts(fr, en) {
  const parts = (fr.parts || []).slice();
  const po = en && en.partOrder;
  if (Array.isArray(po) && po.length) {
    const pos = new Map(po.map((id, i) => [id, i]));
    parts.sort((a, b) => ((pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6)));
  }
  return parts;
}

const sortIds = (ids, order) => {
  if (!Array.isArray(order) || !order.length) return ids;
  const pos = new Map(order.map((id, i) => [id, i]));
  return ids.slice().sort((a, b) => ((pos.get(a) ?? 1e6) - (pos.get(b) ?? 1e6)));
};

function partItemsMap(fr, en) {
  const removed = new Set((en && en.removed) || []);
  const order = (en && en.order) || [];
  const seen = new Set();
  const map = {};
  const push = (list, i) => { if (removed.has(i.id) || seen.has(i.id)) return; seen.add(i.id); list.push(i); };
  for (const p of orderedParts(fr, en)) {
    const list = [];
    map[p.id] = list;
    const eps = (p.episodesList || []).filter(Boolean);
    if (eps.length) {
      const byId = new Map(eps.map((e) => [e.id, e]));
      for (const id of sortIds(eps.map((e) => e.id), order)) {
        const e = byId.get(id);
        if (e) push(list, { ...e, partId: p.id, partLabel: p.label });
      }
    } else {
      push(list, { id: `${p.id}:m`, n: 1, title: p.title, partId: p.id, partLabel: p.label, durationMin: p.durationMin, thumb: p.cover || "" });
    }
  }
  return map;
}

function activeItems(fr, en) {
  const map = partItemsMap(fr, en);
  const out = [];
  for (const p of orderedParts(fr, en)) out.push(...(map[p.id] || []));
  return out;
}

function reorderParts(fr, en, from, to) {
  const ids = orderedParts(fr, en).map((p) => p.id);
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return en;
  const [m] = ids.splice(from, 1);
  ids.splice(to, 0, m);
  return { ...en, partOrder: ids };
}

function reorderPartItems(fr, en, partId, from, to) {
  const map = partItemsMap(fr, en);
  const cur = (map[partId] || []).map((i) => i.id);
  if (from === to || from < 0 || to < 0 || from >= cur.length || to >= cur.length) return en;
  const moved = cur.slice();
  const [m] = moved.splice(from, 1);
  moved.splice(to, 0, m);
  const rebuilt = [];
  for (const p of orderedParts(fr, en)) rebuilt.push(...(p.id === partId ? moved : (map[p.id] || []).map((i) => i.id)));
  const covered = new Set(rebuilt);
  for (const id of (en.order || [])) if (!covered.has(id)) rebuilt.push(id);
  return { ...en, order: rebuilt };
}

const MANUAL_STATUS = { watching: "Sto Guardando", ongoing: "In Corso", completed: "Completata", hold: "In Pausa / Pianificato" };

function computeStatus(fr, en) {
  const items = activeItems(fr, en);
  const total = items.length;
  const done = items.filter((i) => (en.checked || []).includes(i.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (MANUAL_STATUS[en.status]) return { key: en.status, label: MANUAL_STATUS[en.status], pct, done, total, manual: true };
  if (en.paused) return { key: "hold", label: "In Pausa", pct, done, total, manual: false };
  if (done === 0) return { key: "planned", label: "Da iniziare", pct, done, total, manual: false };
  if (total && done === total) {
    if (fr.finished) return { key: "completed", label: "Completata", pct, done, total, manual: false };
    return { key: "ongoing", label: "In Corso", pct, done, total, manual: false };
  }
  return { key: "watching", label: "Sto Guardando", pct, done, total, manual: false };
}
const STATUS_STYLES = { ongoing: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10", completed: "text-violet-300 border-violet-400/40 bg-violet-400/10", watching: "text-sky-300 border-sky-400/40 bg-sky-400/10", hold: "text-amber-300 border-amber-400/40 bg-amber-400/10", planned: "text-zinc-300 border-white/20 bg-white/5" };

function mediaFromPart(p) {
  if (p.media) return p.media;
  const id = p.id || "";
  const n = Number(id.replace(/\D/g, "")) || 0;
  const isMal = /^m/.test(id);
  return {
    id, malId: isMal ? n : null, alId: isMal ? null : n, source: isMal ? "mal" : "al",
    titles: p.title ? [p.title] : [], title: p.title || "", cover: p.cover || "", banner: "",
    synopsis: "", year: p.year || null, score: null, members: null,
    format: "", status: "", episodes: p.episodes || null, durationMin: p.durationMin || null,
    airedFrom: p.airedFrom || null, airedTo: null, airing: false, genres: [], nextAiring: null,
  };
}
const partsFingerprint = (f) => JSON.stringify([
  (f.parts || []).map((p) => [p.id, p.status, p.episodes || 0, Array.isArray(p.episodesList) ? p.episodesList.length : 0, p.label]),
  !!f.finished, f.status,
]);

function mergeFranchise(f, byId, edges, discoveredById) {
  const oldParts = Array.isArray(f.parts) ? f.parts : [];
  if (!oldParts.length) return null;
  const knownIds = new Set(oldParts.map((p) => p.id));
  const refreshed = oldParts.map((p) => {
    const m = byId.get(p.id);
    const base = { ...p, episodesList: Array.isArray(p.episodesList) ? p.episodesList.slice() : p.episodesList, media: p.media || mediaFromPart(p) };
    if (!m) return base;
    const st = compStatus(m.status);
    return {
      ...base, media: m, status: st, finished: st === "finished",
      title: p.title || m.title, cover: p.cover || m.cover,
      year: m.year ?? p.year, airedFrom: m.airedFrom ?? p.airedFrom,
      durationMin: m.durationMin ?? p.durationMin, episodes: m.episodes ?? p.episodes,
    };
  });

  const related = new Set();
  const queue = [];
  for (const id of knownIds) { queue.push(id); }
  const walked = new Set(knownIds);
  while (queue.length && related.size < 60) {
    const t = edges.get(queue.shift());
    if (!t) continue;
    for (const x of t) {
      related.add(x);
      if (!walked.has(x)) { walked.add(x); queue.push(x); }
    }
  }
  const added = [];
  for (const id of related) {
    if (knownIds.has(id)) continue;
    const m = discoveredById.get(id);
    if (!m) continue;
    added.push(m);
    if (added.length >= 40) break;
  }
  added.sort(cmpChron);

  const parts = labelParts([...refreshed, ...added.map(planPart)]);
  for (const p of parts) {
    if (!p.episodesLoaded || !Array.isArray(p.episodesList) || !p.episodesList.length) continue;
    const want = p.episodes || p.media?.episodes || 0;
    if (!want) continue;
    let maxN = 0;
    for (const e of p.episodesList) maxN = Math.max(maxN, e.n || 0);
    if (maxN >= want || want - maxN > 100) continue;
    p.episodesLoaded = false;
  }

  const allFinished = parts.every((p) => p.finished);
  return {
    ...f,
    parts,
    memberIds: parts.map((p) => p.id),
    status: allFinished ? "finished" : "airing",
    finished: allFinished,
    synopsis: f.synopsis || parts.find((p) => p.media?.synopsis)?.media.synopsis || "",
    updatedAt: Date.now(),
  };
}

async function syncLibrary(franchises) {
  const list = (franchises || []).filter((f) => f && (f.parts || []).length);
  if (!list.length) return { changed: [] };

  const sources = [];
  const seen = new Set();
  for (const f of list) for (const p of f.parts) {
    const m = p.media || mediaFromPart(p);
    if (m?.id && !seen.has(m.id)) { seen.add(m.id); sources.push(m); }
  }
  if (!sources.length) return { changed: [] };

  let rel = { edges: new Map(), discovered: [], sources: new Map() };
  try { rel = await discoverRelations(sources, { maxDiscovered: 240, maxRounds: 6 }); }
  catch (e) { console.warn("[sync] relations failed", e); }

  const byId = new Map();
  for (const m of sources) byId.set(m.id, m);
  for (const [id, m] of rel.sources) byId.set(id, m);
  const discoveredById = new Map();
  for (const m of rel.discovered) discoveredById.set(m.id, m);
  for (const [id, m] of byId) if (!discoveredById.has(id)) discoveredById.set(id, m);

  const before = new Map(list.map((f) => [f.id, partsFingerprint(f)]));
  const merged = [];
  for (const f of list) {
    try { const nf = mergeFranchise(f, byId, rel.edges, discoveredById); if (nf) merged.push(nf); }
    catch (e) { console.warn("[sync] merge failed", f.id, e); }
  }

  const loading = [];
  for (const nf of merged) for (const p of nf.parts) {
    if (p.episodesLoaded && Array.isArray(p.episodesList) && p.episodesList.length) continue;
    loading.push(p);
  }
  if (loading.length) {
    let streams = new Map();
    try { streams = await alStreamBatch(loading.map((p) => (p.media || mediaFromPart(p)).id)); } catch (e) { console.warn("[sync] stream batch", e); }
    for (const p of loading) {
      const m = p.media || mediaFromPart(p);
      let eps = [];
      try { eps = await loadPartEpisodes(m, streams); } catch {}
      if (!eps.length) eps = defaultEpisodes(p);
      const old = new Map((Array.isArray(p.episodesList) ? p.episodesList : []).map((e) => [e.id, e]));
      if (old.size) {
        const mergedEps = eps.map((e) => {
          const o = old.get(e.id);
          if (!o) return e;
          return { ...e, title: o.title && !/^Episodio\s/i.test(o.title) ? o.title : e.title, thumb: o.thumb || e.thumb, durationMin: o.durationMin || e.durationMin, site: o.site || e.site };
        });
        const seenEps = new Set(mergedEps.map((e) => e.id));
        for (const [id, o] of old) if (!seenEps.has(id)) mergedEps.push(o);
        eps = mergedEps;
      }
      p.episodesList = eps;
      p.episodesLoaded = true;
    }
  }

  const changed = merged.filter((nf) => partsFingerprint(nf) !== before.get(nf.id));
  for (const nf of changed) await db.franchises.put(nf);
  return { changed };
}

export const SYNC_VERSION = 1;

const _docList = (v) => (Array.isArray(v) ? v : []);
const _ts = (o) => Number(o?.updatedAt) || 0;

export function buildDoc(franchises, entries, deleted = {}, updatedAt = Date.now()) {
  return {
    v: SYNC_VERSION,
    updatedAt: Number(updatedAt) || Date.now(),
    franchises: Object.values(franchises || {}).filter((f) => f && f.id),
    entries: Object.values(entries || {}).filter((e) => e && e.franchiseId),
    deleted: { ...(deleted || {}) },
  };
}

export function normalizeDoc(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const deleted = {};
  for (const [id, t] of Object.entries(d.deleted && typeof d.deleted === "object" ? d.deleted : {})) {
    const n = Number(t) || 0;
    if (id && n) deleted[id] = n;
  }
  return { v: SYNC_VERSION, updatedAt: Number(d.updatedAt) || 0, franchises: _docList(d.franchises), entries: _docList(d.entries), deleted };
}

export function docToStores(doc) {
  const franchises = {}, entries = {};
  for (const f of _docList(doc?.franchises)) if (f?.id) franchises[f.id] = f;
  for (const e of _docList(doc?.entries)) if (e?.franchiseId) entries[e.franchiseId] = e;
  return { franchises, entries };
}

export function mergeDocs(localDoc, remoteDoc) {
  const a = normalizeDoc(localDoc), b = normalizeDoc(remoteDoc);
  const deleted = {};
  for (const [id, t] of Object.entries(a.deleted)) deleted[id] = Math.max(deleted[id] || 0, t);
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] || 0, t);

  const pick = (la, lb, key) => {
    const map = new Map();
    for (const item of [...la, ...lb]) {
      const k = item?.[key];
      if (!k) continue;
      const cur = map.get(k);
      if (!cur || _ts(item) >= _ts(cur)) map.set(k, item);
    }
    return map;
  };

  const fr = pick(a.franchises, b.franchises, "id");
  const en = pick(a.entries, b.entries, "franchiseId");

  for (const [id, t] of Object.entries(deleted)) {
    const f = fr.get(id); if (f && t >= _ts(f)) fr.delete(id);
    const e = en.get(id); if (e && t >= _ts(e)) en.delete(id);
  }

  return {
    v: SYNC_VERSION,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    franchises: [...fr.values()],
    entries: [...en.values()],
    deleted,
  };
}

export function bumpDeleted(deleted, id, when = Date.now()) {
  return { ...(deleted || {}), [id]: Math.max(Number(deleted?.[id]) || 0, Number(when) || Date.now()) };
}

export {
  searchGroups, searchGroupsDetailed, groupResults, defaultEntry, activeItems, computeStatus, STATUS_STYLES, MANUAL_STATUS,
  providerGetMedia, buildFranchise, previewParts, optimisticFranchise, loadPartEpisodes, loadAllEpisodes, defaultEpisodes,
  orderedParts, partItemsMap, reorderParts, reorderPartItems,
  titleKey, syncLibrary,
};
