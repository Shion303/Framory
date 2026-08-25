// Sync engine — updates TMDB-sourced content metadata from TMDB without touching user data.
import { entities } from "@/lib/api";
import { getShowDetail } from "@/lib/tmdb";

// Read the latest sync status record (single-row table).
export async function getSyncStatus() {
  const list = await entities.SyncStatus.list("-created_date", 1);
  return list[0] || null;
}

async function setSyncStatus(patch) {
  const existing = await getSyncStatus();
  if (existing) {
    return await entities.SyncStatus.update(existing.id, patch);
  }
  return await entities.SyncStatus.create({ status: "success", ...patch });
}

// Run a full sync across all TMDB-sourced content.
// Returns { contentsUpdated, seasonsUpdated, episodesAdded, errors }.
export async function runSync({ onProgress = undefined } = {}) {
  await setSyncStatus({ status: "running", last_sync: new Date().toISOString() });

  const all = await entities.Content.list("-created_date", 1000);
  const tmdbContents = all.filter((c) => c.source !== "MANUAL" && c.tmdb_id);

  let contentsUpdated = 0;
  let seasonsUpdated = 0;
  let episodesAdded = 0;
  const errors = [];

  for (let i = 0; i < tmdbContents.length; i++) {
    const c = tmdbContents[i];
    try {
      const detail = await getShowDetail(c.tmdb_id);
      const { show, seasons, episodes } = detail;

      // Update content metadata (never touch user data).
      await entities.Content.update(c.id, {
        title: show.title,
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
        total_seasons: seasons.length,
        total_episodes: episodes.length,
        content_type: show.content_type,
      });
      contentsUpdated++;

      // Sync seasons: update existing, add new.
      const existingSeasons = await entities.Season.filter({ content_id: c.id });
      const byNumber = {};
      existingSeasons.forEach((s) => (byNumber[s.season_number] = s));
      for (const se of seasons) {
        const epCount = episodes.filter((e) => e.season_number === se.season_number).length;
        if (byNumber[se.season_number]) {
          await entities.Season.update(byNumber[se.season_number].id, {
            title: se.title,
            episode_count: epCount,
            poster_url: se.poster_url,
          });
          seasonsUpdated++;
        } else {
          await entities.Season.create({
            content_id: c.id,
            tmdb_id: se.tmdb_id,
            season_number: se.season_number,
            title: se.title,
            episode_count: epCount,
            poster_url: se.poster_url,
            source: "TMDB",
          });
          seasonsUpdated++;
        }
      }
      episodesAdded += episodes.length;

      // Keep library item poster/title in sync.
      const libItems = await entities.LibraryItem.filter({ content_id: c.id });
      for (const item of libItems) {
        await entities.LibraryItem.update(item.id, {
          title: show.title,
          poster_url: show.poster_url,
          content_type: show.content_type,
        });
      }
    } catch (e) {
      errors.push({ id: c.id, title: c.title, error: e.message });
    }
    if (onProgress) onProgress({ done: i + 1, total: tmdbContents.length });
  }

  const summary = `Updated ${contentsUpdated} contents · ${seasonsUpdated} seasons · ${episodesAdded} episodes${errors.length ? ` · ${errors.length} errors` : ""}`;
  await setSyncStatus({
    status: errors.length === tmdbContents.length && tmdbContents.length > 0 ? "failed" : "success",
    last_sync: new Date().toISOString(),
    summary,
    contents_updated: contentsUpdated,
    seasons_updated: seasonsUpdated,
    episodes_added: episodesAdded,
  });

  return { contentsUpdated, seasonsUpdated, episodesAdded, errors };
}

// Background auto-sync: runs only if the last sync was more than `staleMs` ago.
export async function autoSyncIfNeeded(staleMs = 1000 * 60 * 60 * 6) {
  try {
    const status = await getSyncStatus();
    const last = status?.last_sync ? new Date(status.last_sync).getTime() : 0;
    if (Date.now() - last < staleMs) return null;
    return await runSync();
  } catch (e) {
    return null;
  }
}