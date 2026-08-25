// Tracking engine — derives progress from episodes and unlocks trophies.

import { entities } from "@/lib/api";

/* ---------- pure progress helpers ---------- */

export function seasonProgress(season, progressRecords) {
  const seasonNumber = Number(season?.season_number);

  const watched = progressRecords.filter(
    (p) => Number(p.season_number) === seasonNumber
  ).length;

  const total = Number(season?.episode_count) || 0;

  const percent =
    total > 0 ? Math.round((watched / total) * 100) : 0;

  return {
    watched,
    total,
    percent,
    completed: total > 0 && watched >= total,
  };
}

export function contentProgress(seasons, progressRecords) {
  const total = seasons.reduce(
    (sum, season) => sum + (Number(season?.episode_count) || 0),
    0
  );

  const seasonNumbers = new Set(
    seasons.map((season) => Number(season.season_number))
  );

  const watched = progressRecords.filter((p) =>
    seasonNumbers.has(Number(p.season_number))
  ).length;

  const percent =
    total > 0 ? Math.round((watched / total) * 1000) / 10 : 0;

  return {
    watched,
    total,
    percent,
    completed: total > 0 && watched >= total,
  };
}

export function franchiseProgress(
  franchiseContents,
  seasonsByContent,
  progressByContent
) {
  let total = 0;
  let watched = 0;

  franchiseContents.forEach((fc) => {
    const seasons = seasonsByContent[fc.content_id] || [];
    const prog = progressByContent[fc.content_id] || [];

    const seasonNumbers = new Set(
      seasons.map((season) => Number(season.season_number))
    );

    total += seasons.reduce(
      (sum, season) =>
        sum + (Number(season?.episode_count) || 0),
      0
    );

    watched += prog.filter((p) =>
      seasonNumbers.has(Number(p.season_number))
    ).length;
  });

  const percent =
    total > 0 ? Math.round((watched / total) * 1000) / 10 : 0;

  return {
    watched,
    total,
    percent,
    completed: total > 0 && watched >= total,
  };
}

/* ---------- DB helpers ---------- */

export async function loadLibraryItems() {
  return await entities.LibraryItem.list("-updated_date", 500);
}

export async function loadSeasonsForContent(contentId) {
  return await entities.Season.filter({
    content_id: contentId,
  });
}

export async function loadProgressForContent(contentId) {
  return await entities.EpisodeProgress.filter({
    content_id: contentId,
  });
}

export async function loadEpisodesForContent(contentId) {
  return await entities.Episode.filter({
    content_id: contentId,
  });
}

export async function loadAllSeasonsGrouped(libraryItems) {
  const ids = libraryItems
    .map((item) => item.content_id)
    .filter(Boolean);

  const all = await Promise.all(
    ids.map((id) =>
      entities.Season.filter({
        content_id: id,
      })
    )
  );

  const map = {};

  ids.forEach((id, index) => {
    map[id] = all[index];
  });

  return map;
}

export async function loadAllProgressGrouped(libraryItems) {
  const ids = libraryItems
    .map((item) => item.content_id)
    .filter(Boolean);

  const all = await Promise.all(
    ids.map((id) =>
      entities.EpisodeProgress.filter({
        content_id: id,
      })
    )
  );

  const map = {};

  ids.forEach((id, index) => {
    map[id] = all[index];
  });

  return map;
}

/* ---------- ensure content + seasons persisted when added to library ---------- */

export async function ensureContentPersisted(detail) {
  const { show, seasons = [] } = detail;

  const existing = show?.tvmaze_id
    ? await entities.Content.filter({
        tvmaze_id: show.tvmaze_id,
      })
    : [];

  let contentId;

  if (existing.length > 0) {
    contentId = existing[0].id;

    await entities.Content.update(contentId, {
      total_seasons: show.total_seasons,
      total_episodes: show.total_episodes,
      content_type:
        show.content_type ||
        existing[0].content_type ||
        "TV_SERIES",
      source: "TVMAZE",
      provider: "TVMAZE",
      provider_id: show.tvmaze_id
        ? String(show.tvmaze_id)
        : "",
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
      provider_id: show.tvmaze_id
        ? String(show.tvmaze_id)
        : "",
    });

    contentId = created.id;
  }

  /* ---------- persist seasons ---------- */

  const existingSeasons =
    await entities.Season.filter({
      content_id: contentId,
    });

  const existingNumbers = new Set(
    existingSeasons.map((season) =>
      Number(season.season_number)
    )
  );

  const toCreate = seasons.filter(
    (season) =>
      !existingNumbers.has(
        Number(season.season_number)
      )
  );

  if (toCreate.length > 0) {
    await entities.Season.bulkCreate(
      toCreate.map((season) => ({
        content_id: contentId,
        tvmaze_id: season.tvmaze_id,
        season_number: season.season_number,
        title: season.title,
        episode_count: season.episode_count,
        poster_url: season.poster_url,
        source: "TVMAZE",
      }))
    );
  }

  return contentId;
}

/* ---------- build show from stored Content ---------- */

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

export async function setEpisodeWatched(
  contentId,
  seasonNumber,
  episodeNumber,
  watched
) {
  const normalizedSeason = Number(seasonNumber);
  const normalizedEpisode = Number(episodeNumber);

  const matches = await entities.EpisodeProgress.filter({
    content_id: contentId,
    season_number: normalizedSeason,
    episode_number: normalizedEpisode,
  });

  if (watched) {
    if (matches.length === 0) {
      await entities.EpisodeProgress.create({
        content_id: contentId,
        season_number: normalizedSeason,
        episode_number: normalizedEpisode,
        watched_date: new Date().toISOString(),
      });
    }
  } else {
    for (const match of matches) {
      await entities.EpisodeProgress.delete(match.id);
    }
  }
}

/* ---------- season toggle ---------- */

export async function setSeasonWatched(
  contentId,
  season,
  episodes,
  watched
) {
  const normalizedSeason = Number(
    season.season_number
  );

  const existing =
    await entities.EpisodeProgress.filter({
      content_id: contentId,
      season_number: normalizedSeason,
    });

  const existingNums = new Set(
    existing.map((p) => Number(p.episode_number))
  );

  if (watched) {
    const toCreate = episodes
      .filter(
        (episode) =>
          Number(episode.season_number) ===
            normalizedSeason &&
          !existingNums.has(
            Number(episode.episode_number)
          )
      )
      .map((episode) => ({
        content_id: contentId,
        season_number: normalizedSeason,
        episode_number: Number(
          episode.episode_number
        ),
        watched_date: new Date().toISOString(),
      }));

    if (toCreate.length > 0) {
      await entities.EpisodeProgress.bulkCreate(
        toCreate
      );
    }
  } else {
    for (const progress of existing) {
      await entities.EpisodeProgress.delete(
        progress.id
      );
    }
  }
}

/* ---------- sync after a change: status + trophies ---------- */

export async function syncContentStatus(contentId) {
  const [
    seasons,
    progress,
    libraryItems,
  ] = await Promise.all([
    loadSeasonsForContent(contentId),
    loadProgressForContent(contentId),
    entities.LibraryItem.filter({
      content_id: contentId,
    }),
  ]);

  const cp = contentProgress(
    seasons,
    progress
  );

  const item = libraryItems[0];

  if (!item) {
    return {
      completed: cp.completed,
      unlocked: [],
    };
  }

  if (
    cp.completed &&
    item.status !== "completed"
  ) {
    await entities.LibraryItem.update(
      item.id,
      {
        status: "completed",
      }
    );
  } else if (
    !cp.completed &&
    item.status === "completed"
  ) {
    await entities.LibraryItem.update(
      item.id,
      {
        status: "watching",
      }
    );
  }

  const unlocked =
    await checkAndUnlockTrophies(
      contentId,
      cp.completed
    );

  return {
    completed: cp.completed,
    unlocked,
  };
}

/* ---------- trophy unlocking ---------- */

export async function checkAndUnlockTrophies(
  contentId,
  contentCompleted
) {
  const unlocked = [];

  if (!contentCompleted) {
    return unlocked;
  }

  const trophies =
    await entities.Trophy.filter({
      condition_type: "complete_series",
      condition_content_id: contentId,
      is_unlocked: false,
    });

  for (const trophy of trophies) {
    const unlockedDate =
      new Date().toISOString();

    await entities.Trophy.update(
      trophy.id,
      {
        is_unlocked: true,
        unlocked_date: unlockedDate,
      }
    );

    unlocked.push({
      ...trophy,
      is_unlocked: true,
      unlocked_date: unlockedDate,
    });
  }

  return unlocked;
}

/* ---------- full trophy re-evaluation ---------- */

export async function reevaluateAllTrophies() {
  const trophies =
    await entities.Trophy.list();

  const locked = trophies.filter(
    (trophy) =>
      !trophy.is_unlocked &&
      trophy.condition_type ===
        "complete_series" &&
      trophy.condition_content_id
  );

  if (locked.length === 0) {
    return [];
  }

  const contentIds = [
    ...new Set(
      locked.map(
        (trophy) =>
          trophy.condition_content_id
      )
    ),
  ];

  const results = await Promise.all(
    contentIds.map(async (contentId) => {
      const [
        seasons,
        progress,
      ] = await Promise.all([
        loadSeasonsForContent(contentId),
        loadProgressForContent(contentId),
      ]);

      return {
        contentId,
        completed:
          contentProgress(
            seasons,
            progress
          ).completed,
      };
    })
  );

  const completedSet = new Set(
    results
      .filter((result) => result.completed)
      .map((result) => result.contentId)
  );

  const newlyUnlocked = [];

  for (const trophy of locked) {
    if (
      completedSet.has(
        trophy.condition_content_id
      )
    ) {
      const unlockedDate =
        new Date().toISOString();

      await entities.Trophy.update(
        trophy.id,
        {
          is_unlocked: true,
          unlocked_date: unlockedDate,
        }
      );

      newlyUnlocked.push({
        ...trophy,
        is_unlocked: true,
        unlocked_date: unlockedDate,
      });
    }
  }

  return newlyUnlocked;
}