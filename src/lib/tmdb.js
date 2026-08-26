// TMDB API client — single external data source for Framory.
// Supports TV series, anime and films.
// Requires VITE_TMDB_API_KEY environment variable.
// https://developer.themoviedb.org

const BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

function authHeaders() {
  return {
    Authorization: `Bearer ${import.meta.env.VITE_TMDB_API_KEY}`,
    accept: "application/json",
  };
}

const memCache = {
  pool: null,
  poolTime: 0,
  trending: null,
  trendingTime: 0,
  detail: {},
};

const POOL_TTL = 1000 * 60 * 60;
const TRENDING_TTL = 1000 * 60 * 20;
const DETAIL_TTL = 1000 * 60 * 60 * 6;

const TV_GENRES = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

const MOVIE_GENRES = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

function imgUrl(path, size = "w500") {
  if (!path) return "";
  return `${IMG_BASE}/${size}${path}`;
}

export function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, "").trim();
}

export function classifyShow(show) {
  const ids =
    show?.genre_ids ||
    show?.genres?.map((g) => g.id) ||
    [];

  const isAnimation = ids.includes(16);
  const isJapanese = (show?.original_language || "") === "ja";

  if (isAnimation && isJapanese) {
    return "ANIME";
  }

  return "TV_SERIES";
}

function resolveGenres(genreIds = [], mediaType = "tv") {
  const map =
    mediaType === "movie"
      ? MOVIE_GENRES
      : TV_GENRES;

  return genreIds
    .map((id) => map[id] || TV_GENRES[id] || MOVIE_GENRES[id])
    .filter(Boolean);
}

function normalizeShow(show, mediaType = "tv") {
  if (!show) return null;

  const genreIds =
    show.genre_ids ||
    show.genres?.map((g) => g.id) ||
    [];

  const genres = resolveGenres(genreIds, mediaType);

  const dateStr =
    mediaType === "movie"
      ? show.release_date || ""
      : show.first_air_date || "";

  const year = dateStr
    ? parseInt(dateStr.slice(0, 4), 10)
    : null;

  if (mediaType === "movie") {
    return {
      tmdb_id: show.id,

      title:
        show.title ||
        show.original_title ||
        "Untitled",

      original_title:
        show.original_title ||
        show.title ||
        "",

      summary: stripHtml(show.overview),

      poster_url: imgUrl(show.poster_path),

      backdrop_url: imgUrl(
        show.backdrop_path,
        "w1280"
      ),

      genres,

      year,

      status: show.status || "",

      network:
        show.production_companies
          ?.map((c) => c.name)
          .join(", ") || "",

      type: "Movie",

      rating: show.vote_average || 0,

      language:
        show.original_language || "",

      country:
        show.production_countries
          ?.map((c) => c.iso_3166_1)
          .join(", ") || "",

      release_date: dateStr,

      weight: show.popularity || 0,

      content_type: "FILM",

      source: "TMDB",

      total_seasons: 1,

      total_episodes: 1,
    };
  }

  return {
    tmdb_id: show.id,

    title:
      show.name ||
      show.original_name ||
      "Untitled",

    original_title:
      show.original_name ||
      show.name ||
      "",

    summary: stripHtml(show.overview),

    poster_url: imgUrl(show.poster_path),

    backdrop_url: imgUrl(
      show.backdrop_path,
      "w1280"
    ),

    genres,

    year,

    status: show.status || "",

    network:
      show.networks
        ?.map((n) => n.name)
        .join(", ") ||
      show.production_companies
        ?.map((c) => c.name)
        .join(", ") ||
      "",

    type: show.type || "",

    rating: show.vote_average || 0,

    language:
      show.original_language || "",

    country:
      (show.origin_country || []).join(", "),

    release_date: dateStr,

    weight: show.popularity || 0,

    content_type: classifyShow(show),

    source: "TMDB",

    total_seasons:
      show.number_of_seasons || 0,

    total_episodes:
      show.number_of_episodes || 0,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    let message = "";

    try {
      const data = await res.json();

      message =
        data?.status_message ||
        data?.message ||
        "";
    } catch {
      // Ignore JSON parsing errors.
    }

    throw new Error(
      `TMDB request failed (${res.status})${
        message ? `: ${message}` : ""
      }`
    );
  }

  return res.json();
}

export async function searchShows(query) {
  const q = query.trim();

  if (!q) return [];

  const [tvData, movieData] =
    await Promise.all([
      fetchJson(
        `${BASE}/search/tv?query=${encodeURIComponent(
          q
        )}&include_adult=false`
      ),

      fetchJson(
        `${BASE}/search/movie?query=${encodeURIComponent(
          q
        )}&include_adult=false`
      ),
    ]);

  const tvShows = (tvData.results || [])
    .map((s) =>
      normalizeShow(s, "tv")
    )
    .filter(Boolean)
    .filter((s) => s.tmdb_id);

  const movies = (movieData.results || [])
    .map((m) =>
      normalizeShow(m, "movie")
    )
    .filter(Boolean)
    .filter((m) => m.tmdb_id);

  return [...tvShows, ...movies];
}

export async function getShowPool() {
  const now = Date.now();

  if (
    memCache.pool &&
    now - memCache.poolTime < POOL_TTL
  ) {
    return memCache.pool;
  }

  const discoverData =
    await fetchJson(
      `${BASE}/discover/tv?sort_by=popularity.desc&include_null_first_air_dates=false&page=1`
    );

  const shows = (discoverData.results || [])
    .map((s) =>
      normalizeShow(s, "tv")
    )
    .filter(Boolean);

  memCache.pool = shows;
  memCache.poolTime = now;

  return shows;
}

export async function getScheduleToday() {
  const now = Date.now();

  if (
    memCache.trending &&
    now - memCache.trendingTime < TRENDING_TTL
  ) {
    return memCache.trending;
  }

  const data =
    await fetchJson(
      `${BASE}/trending/tv/week`
    );

  const shows = (data.results || [])
    .map((s) =>
      normalizeShow(s, "tv")
    )
    .filter(Boolean);

  memCache.trending = shows;
  memCache.trendingTime = now;

  return shows;
}

/**
 * Loads complete details for either:
 * - a TV series / anime
 * - a film
 *
 * Important:
 * A numeric TMDB ID alone is ambiguous because
 * the same ID can theoretically exist in both
 * the TV and movie namespaces.
 *
 * We therefore try TV first and, if that fails,
 * try movie.
 */
export async function getShowDetail(
  id,
  preferredMediaType = null
) {
  const key = `${preferredMediaType || "auto"}:${String(
    id
  )}`;

  const now = Date.now();

  if (
    memCache.detail[key] &&
    now - memCache.detail[key].time < DETAIL_TTL
  ) {
    return memCache.detail[key].data;
  }

  let mediaType =
    preferredMediaType === "movie"
      ? "movie"
      : preferredMediaType === "tv"
      ? "tv"
      : null;

  let showData = null;

  if (mediaType === "movie") {
    showData = await fetchJson(
      `${BASE}/movie/${id}`
    );
  } else if (mediaType === "tv") {
    showData = await fetchJson(
      `${BASE}/tv/${id}`
    );
  } else {
    try {
      showData = await fetchJson(
        `${BASE}/tv/${id}`
      );

      mediaType = "tv";
    } catch (tvError) {
      try {
        showData = await fetchJson(
          `${BASE}/movie/${id}`
        );

        mediaType = "movie";
      } catch (movieError) {
        throw tvError;
      }
    }
  }

  const show = normalizeShow(
    showData,
    mediaType
  );

  if (!show) {
    throw new Error(
      "Unable to normalize TMDB content"
    );
  }

  /*
   * FILM
   *
   * Films are represented as a single virtual episode
   * inside an internal "season 0". This lets the
   * existing tracking system (progress, completion,
   * trophies) work without any special-casing.
   */
  if (mediaType === "movie") {
    const virtualSeason = {
      tmdb_id: null,
      season_number: 1,
      title: "Film",
      episode_count: 1,
      poster_url: show.poster_url,
    };

    const virtualEpisode = {
      tmdb_id: show.tmdb_id,
      season_number: 1,
      episode_number: 1,
      title: show.title,
      description: show.summary || "",
      airdate: show.release_date || "",
      runtime: 0,
      image_url: show.poster_url || "",
    };

    show.total_seasons = 1;
    show.total_episodes = 1;

    const result = {
      show,
      seasons: [virtualSeason],
      episodes: [virtualEpisode],
    };

    memCache.detail[key] = {
      time: now,
      data: result,
    };

    return result;
  }

  /*
   * TV SERIES / ANIME
   */
  const numSeasons =
    showData.number_of_seasons || 0;

  const seasonPromises = [];

  for (
    let i = 1;
    i <= numSeasons;
    i++
  ) {
    seasonPromises.push(
      fetchJson(
        `${BASE}/tv/${id}/season/${i}`
      ).catch(() => null)
    );
  }

  const seasonResults =
    await Promise.all(
      seasonPromises
    );

  const seasons = [];
  const episodes = [];

  for (const seasonData of seasonResults) {
    if (
      !seasonData ||
      seasonData.season_number <= 0
    ) {
      continue;
    }

    seasons.push({
      tmdb_id: seasonData.id,

      season_number:
        seasonData.season_number,

      title:
        seasonData.name || "",

      episode_count:
        seasonData.episodes?.length || 0,

      poster_url: imgUrl(
        seasonData.poster_path
      ),
    });

    for (const ep of
      seasonData.episodes || []) {
      if (ep.episode_number <= 0) {
        continue;
      }

      episodes.push({
        tmdb_id: ep.id,

        season_number:
          ep.season_number,

        episode_number:
          ep.episode_number,

        title:
          ep.name ||
          `Episode ${ep.episode_number}`,

        description:
          stripHtml(ep.overview),

        airdate:
          ep.air_date || "",

        runtime:
          ep.runtime || 0,

        image_url: imgUrl(
          ep.still_path,
          "w300"
        ),
      });
    }
  }

  show.total_seasons =
    seasons.length;

  show.total_episodes =
    episodes.length;

  const result = {
    show,
    seasons,
    episodes,
  };

  memCache.detail[key] = {
    time: now,
    data: result,
  };

  return result;
}

export function getDiscoverySections(
  pool,
  schedule
) {
  const byId = new Map();

  pool.forEach((s) =>
    byId.set(s.tmdb_id, s)
  );

  schedule.forEach((s) => {
    if (!byId.has(s.tmdb_id)) {
      byId.set(s.tmdb_id, s);
    }
  });

  const all =
    Array.from(byId.values());

  const trending = [...schedule]
    .sort(
      (a, b) =>
        b.weight - a.weight
    )
    .slice(0, 20);

  const popular = [...all]
    .sort(
      (a, b) =>
        b.weight - a.weight
    )
    .slice(0, 20);

  const topRated = [...all]
    .filter((s) => s.rating > 0)
    .sort(
      (a, b) =>
        b.rating - a.rating
    )
    .slice(0, 20);

  const genreMap = {};

  all.forEach((s) => {
    s.genres.forEach((g) => {
      if (!genreMap[g]) {
        genreMap[g] = [];
      }

      genreMap[g].push(s);
    });
  });

  const genres = Object.keys(
    genreMap
  )
    .sort(
      (a, b) =>
        genreMap[b].length -
        genreMap[a].length
    )
    .slice(0, 8)
    .map((g) => ({
      name: g,

      shows: [...genreMap[g]]
        .sort(
          (a, b) =>
            b.weight - a.weight
        )
        .slice(0, 20),
    }));

  return {
    trending,
    popular,
    topRated,
    genres,
  };
}