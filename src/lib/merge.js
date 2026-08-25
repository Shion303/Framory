// Merge engine — combines two content records into one without losing user data.
import { entities } from "@/lib/api";

// Merge `secondaryId` into `primaryId`. The primary record is kept as the definitive reference.
export async function mergeContents(primaryId, secondaryId) {
  if (primaryId === secondaryId) throw new Error("Cannot merge a content with itself.");

  const [primary, secondary] = await Promise.all([
    entities.Content.get(primaryId),
    entities.Content.get(secondaryId),
  ]);
  if (!primary || !secondary) throw new Error("One or both contents not found.");

  // 1. EpisodeProgress — move secondary's progress to primary, dedupe by (season, episode).
  const [primaryProgress, secondaryProgress] = await Promise.all([
    entities.EpisodeProgress.filter({ content_id: secondaryId }), // secondary's
    entities.EpisodeProgress.filter({ content_id: primaryId }),
  ]);
  const primaryKeys = new Set(primaryProgress.map((p) => `${p.season_number}-${p.episode_number}`));
  for (const p of secondaryProgress) {
    const key = `${p.season_number}-${p.episode_number}`;
    if (primaryKeys.has(key)) {
      // duplicate episode — drop secondary's record, keep primary's watched state
      await entities.EpisodeProgress.delete(p.id);
    } else {
      await entities.EpisodeProgress.update(p.id, { content_id: primaryId });
      primaryKeys.add(key);
    }
  }

  // 2. Seasons — move secondary's seasons to primary, dedupe by season_number.
  const [primarySeasons, secondarySeasons] = await Promise.all([
    entities.Season.filter({ content_id: primaryId }),
    entities.Season.filter({ content_id: secondaryId }),
  ]);
  const primarySeasonNumbers = new Set(primarySeasons.map((s) => s.season_number));
  for (const s of secondarySeasons) {
    if (primarySeasonNumbers.has(s.season_number)) {
      await entities.Season.delete(s.id);
    } else {
      await entities.Season.update(s.id, { content_id: primaryId });
      primarySeasonNumbers.add(s.season_number);
    }
  }

  // 3. Episodes (manual) — move secondary's stored episodes to primary, dedupe.
  const [primaryEps, secondaryEps] = await Promise.all([
    entities.Episode.filter({ content_id: primaryId }),
    entities.Episode.filter({ content_id: secondaryId }),
  ]);
  const primaryEpKeys = new Set(primaryEps.map((e) => `${e.season_number}-${e.episode_number}`));
  for (const e of secondaryEps) {
    const key = `${e.season_number}-${e.episode_number}`;
    if (primaryEpKeys.has(key)) {
      await entities.Episode.delete(e.id);
    } else {
      await entities.Episode.update(e.id, { content_id: primaryId });
      primaryEpKeys.add(key);
    }
  }

  // 4. LibraryItem — keep primary's; if only secondary has one, reassign it.
  const [primaryLib, secondaryLib] = await Promise.all([
    entities.LibraryItem.filter({ content_id: primaryId }),
    entities.LibraryItem.filter({ content_id: secondaryId }),
  ]);
  if (primaryLib.length === 0 && secondaryLib.length > 0) {
    await entities.LibraryItem.update(secondaryLib[0].id, {
      content_id: primaryId,
      title: primary.title,
      poster_url: primary.poster_url || secondaryLib[0].poster_url,
      content_type: primary.content_type,
    });
  } else if (secondaryLib.length > 0) {
    await entities.LibraryItem.delete(secondaryLib[0].id);
  }

  // 5. FranchiseContent — move secondary's links to primary, dedupe by franchise_id.
  const [primaryLinks, secondaryLinks] = await Promise.all([
    entities.FranchiseContent.filter({ content_id: primaryId }),
    entities.FranchiseContent.filter({ content_id: secondaryId }),
  ]);
  const primaryFranchiseIds = new Set(primaryLinks.map((l) => l.franchise_id));
  for (const l of secondaryLinks) {
    if (primaryFranchiseIds.has(l.franchise_id)) {
      await entities.FranchiseContent.delete(l.id);
    } else {
      await entities.FranchiseContent.update(l.id, {
        content_id: primaryId,
        title: primary.title,
        poster_url: primary.poster_url || l.poster_url,
      });
      primaryFranchiseIds.add(l.franchise_id);
    }
  }

  // 6. Trophies — repoint any trophy tied to the secondary content to the primary.
  const secondaryTrophies = await entities.Trophy.filter({ condition_content_id: secondaryId });
  for (const t of secondaryTrophies) {
    await entities.Trophy.update(t.id, {
      condition_content_id: primaryId,
      condition_content_title: primary.title,
    });
  }

  // 7. Fill missing metadata on primary from secondary (never overwrite existing values).
  const fill = {};
  if (!primary.summary && secondary.summary) fill.summary = secondary.summary;
  if (!primary.poster_url && secondary.poster_url) fill.poster_url = secondary.poster_url;
  if (!primary.backdrop_url && secondary.backdrop_url) fill.backdrop_url = secondary.backdrop_url;
  if ((!primary.genres || primary.genres.length === 0) && secondary.genres?.length) fill.genres = secondary.genres;
  if (!primary.network && secondary.network) fill.network = secondary.network;
  if (!primary.language && secondary.language) fill.language = secondary.language;
  if (!primary.country && secondary.country) fill.country = secondary.country;
  if (!primary.release_date && secondary.release_date) fill.release_date = secondary.release_date;
  if (!primary.original_title && secondary.original_title) fill.original_title = secondary.original_title;
  if ((!primary.rating || primary.rating === 0) && secondary.rating) fill.rating = secondary.rating;
  if ((!primary.total_episodes || primary.total_episodes === 0) && secondary.total_episodes)
    fill.total_episodes = secondary.total_episodes;
  if ((!primary.total_seasons || primary.total_seasons === 0) && secondary.total_seasons)
    fill.total_seasons = secondary.total_seasons;
  if (Object.keys(fill).length > 0) await entities.Content.update(primaryId, fill);

  // 8. Delete the secondary content record.
  await entities.Content.delete(secondaryId);

  // 9. Record merge history.
  await entities.MergeHistory.create({
    primary_content_id: primaryId,
    primary_title: primary.title,
    merged_content_ids: [secondaryId],
    merged_titles: [secondary.title],
    merge_date: new Date().toISOString(),
  });

  return { primary, secondary };
}

export async function getMergeHistory() {
  return await entities.MergeHistory.list("-created_date", 100);
}