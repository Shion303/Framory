// Tracking engine — derives progress from episodes and unlocks trophies.
import { entities } from "@/lib/api";

/* ---------- pure progress helpers ---------- */

export function seasonProgress(season, progressRecords) {
  const watched = progressRecords.filter(
    (p) => p.season_number === season.season_number
  ).length;
  const total = season.episode_count || 0;
  const percent = total > 0 ? Math.round((watched / total) * 100) : 0;
  return { watched, total, percent, completed: total > 0 && watched >= total };
}

export function contentProgress(seasons, progressRecords) {
  const total = seasons.reduce((s, se) => s + (se.episode_count || 0), 0);
  const seasonNumbers = new Set(seasons.map((s) => s.season_number));
  const watched = progressRecords.filter((p) => seasonNumbers.has(p.season_number)).length;
  const percent = total > 0 ? Math.round((watched / total) * 1000) / 10 : 0;
  return { watched, total, percent, completed: total > 0 && watched >= total };
}

export function franchiseProgress(franchiseContents, seasonsByContent, progressByContent) {
  let total = 0;
  let watched = 0;
  franchiseContents.forEach((fc) => {
    const seasons = seasonsByContent[fc.content_id] || [];
    const prog = progressByContent[fc.content_id] || [];
    const seasonNumbers = new Set(seasons.map((s) => s.season_number));
    total += seasons.reduce((s, se) => s + (se.episode_count || 0), 0);
    watched += prog.filter((p) => seasonNumbers.has(p.season_number)).length;
  });
  const percent = total > 0 ? Math.round((watched / total) * 1000) / 10 : 0;
  return { watched, total, percent, completed: total > 0 && watched >= total };
}

/* ---------- DB helpers ---------- */

export async function loadLibraryItems() {
  return await entities.LibraryItem.list("-updated_date", 500);
}

export async function loadSeasonsForContent(contentId) {
  return await entities.Season.filter({ content_id: contentId });
}

export async function loadProgressForContent(contentId) {
  return await entities.EpisodeProgress.filter({ content_id: contentId });
}

export async function loadAllSeasonsGrouped(libraryItems) {
  const ids = libraryItems.map((i) => i.content_id);
  const all = await Promise.all(ids.map((id) => entities.Season.filter({ content_id: id })));
  const map = {};
  ids.forEach((id, i) => {
    map[id] = all[i];
  });
  return map;
}

export async function loadAllProgressGrouped(libraryItems) {
  const ids = libraryItems.map((i) => i.content_id);
  const all = await Promise.all(ids.map((id) => entities.EpisodeProgress.filter({ content_id: id })));
  const map = {};
  ids.forEach((id, i) => {
    map[id] = all[i];
  });
  return map;
}

/* ---------- ensure content + seasons persisted when added to library ---------- */

export async function ensureContentPersisted(detail) {
  const { show, seasons } = detail;
  const existing = show.tvmaze_id
    ? await entities.Content.filter({ tvmaze_id: show.tvmaze_id })
    : [];
  let contentId;
  if (existing.length > 0) {
    contentId = existing[0].id;
    await entities.Content.update(contentId, {
      total_seasons: show.total_seasons,
      total_episodes: show.total_episodes,
      content_type: show.content_type || existing[0].content_type || "TV_SERIES",
      source: "TVMAZE",
      provider: "TVMAZE",
      provider_id: String(show.tvmaze_id),
    });
  } else {
    const created = await entities.Content.create({
      tvmaze_id: show.tvmaze_id,
      title: show.title,
      original_title: show.original_title,
      summary: show.summary,
      poster_url: show.poster_url,
      backdrop_url: show.backdrop_url,
      genres: show.genres,
      year: show.year,
      status: show.status,
      network: show.network,
      type: show.type,
      rating: show.rating,
      language: show.language,
      country: show.country,
      release_date: show.release_date,
      total_seasons: show.total_seasons,
      total_episodes: show.total_episodes,
      content_type: show.content_type || "TV_SERIES",
      source: "TVMAZE",
      provider: "TVMAZE",
      provider_id: show.tvmaze_id ? String(show.tvmaze_id) : "",
    });
    contentId = created.id;
  }

  // persist seasons (idempotent)
  const existingSeasons = await entities.Season.filter({ content_id: contentId });
  const existingNumbers = new Set(existingSeasons.map((s) => s.season_number));
  const toCreate = seasons.filter((s) => !existingNumbers.has(s.season_number));
  if (toCreate.length > 0) {
    await entities.Season.bulkCreate(
      toCreate.map((s) => ({
        content_id: contentId,
        tvmaze_id: s.tvmaze_id,
        season_number: s.season_number,
        title: s.title,
        episode_count: s.episode_count,
        poster_url: s.poster_url,
        source: "TVMAZE",
      }))
    );
  }
  return contentId;
}

// Load manually-created episodes for a content (stored in Episode entity).
export async function loadEpisodesForContent(contentId) {
  return await entities.Episode.filter({ content_id: contentId });
}

// Build a "show"-like object from a stored Content record (for manual content).
export function showFromContentRecord(c) {
  return {
    tvmaze_id: c.tvmaze_id || null,
    title: c.title || "Untitled",
    original_title: c.original_title || "",
    summary: c.summary || "",
    poster_url: c.poster_url || "",
    backdrop_url: c.backdrop_url || "",
    genres: c.genres || [],
    year: c.year || null,
    status: c.status || "",
    network: c.network || "",
    type: c.type || "",
    rating: c.rating || 0,
    language: c.language || "",
    country: c.country || "",
    release_date: c.release_date || "",
    content_type: c.content_type || "TV_SERIES",
    source: c.source || "TVMAZE",
    total_seasons: c.total_seasons || 0,
    total_episodes: c.total_episodes || 0,
  };
}

/* ---------- episode toggle ---------- */

export async function setEpisodeWatched(contentId, seasonNumber, episodeNumber, watched) {
  const matches = await entities.EpisodeProgress.filter({
    content_id: contentId,
    season_number: seasonNumber,
    episode_number: episodeNumber,
  });
  if (watched) {
    if (matches.length === 0) {
      await entities.EpisodeProgress.create({
        content_id: contentId,
        season_number: seasonNumber,
        episode_number: episodeNumber,
        watched_date: new Date().toISOString(),
      });
    }
  } else {
    if (matches.length > 0) {
      await entities.EpisodeProgress.delete(matches[0].id);
    }
  }
}

export async function setSeasonWatched(contentId, season, episodes, watched) {
  const existing = await entities.EpisodeProgress.filter({
    content_id: contentId,
    season_number: season.season_number,
  });
  const existingNums = new Set(existing.map((p) => p.episode_number));
  if (watched) {
    const toCreate = episodes
      .filter((e) => e.season_number === season.season_number && !existingNums.has(e.episode_number))
      .map((e) => ({
        content_id: contentId,
        season_number: season.season_number,
        episode_number: e.episode_number,
        watched_date: new Date().toISOString(),
      }));
    if (toCreate.length > 0) await entities.EpisodeProgress.bulkCreate(toCreate);
  } else {
    if (existing.length > 0) {
      await entities.EpisodeProgress.deleteMany({
        content_id: contentId,
        season_number: season.season_number,
      });
    }
  }
}

/* ---------- sync after a change: status + trophies ---------- */

export async function syncContentStatus(contentId) {
  const [seasons, progress, libraryItems] = await Promise.all([
    loadSeasonsForContent(contentId),
    loadProgressForContent(contentId),
    entities.LibraryItem.filter({ content_id: contentId }),
  ]);
  const cp = contentProgress(seasons, progress);
  const item = libraryItems[0];
  if (!item) return { completed: cp.completed, unlocked: [] };

  if (cp.completed && item.status !== "completed") {
    await entities.LibraryItem.update(item.id, { status: "completed" });
  } else if (!cp.completed && item.status === "completed") {
    await entities.LibraryItem.update(item.id, { status: "watching" });
  }

  const unlocked = await checkAndUnlockTrophies(contentId, cp.completed);
  return { completed: cp.completed, unlocked };
}

export async function checkAndUnlockTrophies(contentId, contentCompleted) {
  const unlocked = [];
  if (!contentCompleted) return unlocked;
  const trophies = await entities.Trophy.filter({
    condition_type: "complete_series",
    condition_content_id: contentId,
    is_unlocked: false,
  });
  for (const t of trophies) {
    await entities.Trophy.update(t.id, {
      is_unlocked: true,
      unlocked_date: new Date().toISOString(),
    });
    unlocked.push({ ...t, is_unlocked: true, unlocked_date: new Date().toISOString() });
  }
  return unlocked;
}

/* ---------- full trophy re-evaluation (for settings / home) ---------- */

export async function reevaluateAllTrophies() {
  const trophies = await entities.Trophy.list();
  const locked = trophies.filter((t) => !t.is_unlocked && t.condition_type === "complete_series" && t.condition_content_id);
  if (locked.length === 0) return [];
  const contentIds = [...new Set(locked.map((t) => t.condition_content_id))];
  const results = await Promise.all(
    contentIds.map(async (cid) => {
      const [seasons, progress] = await Promise.all([
        loadSeasonsForContent(cid),
        loadProgressForContent(cid),
      ]);
      return { cid, completed: contentProgress(seasons, progress).completed };
    })
  );
  const completedSet = new Set(results.filter((r) => r.completed).map((r) => r.cid));
  const newlyUnlocked = [];
  for (const t of locked) {
    if (completedSet.has(t.condition_content_id)) {
      await entities.Trophy.update(t.id, {
        is_unlocked: true,
        unlocked_date: new Date().toISOString(),
      });
      newlyUnlocked.push({ ...t, is_unlocked: true, unlocked_date: new Date().toISOString() });
    }
  }
  return newlyUnlocked;
}