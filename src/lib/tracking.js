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

/* ---------- ensure content + seasons + episodes persisted ---------- */

export async function ensureContentPersisted(detail) {
  const {
    show,
    seasons = [],
    episodes = [],
    existingContentId,
  } = detail;

  const isFilm = show?.content_type === "FILM";

  let existing = [];

  if (existingContentId) {
    const byId = await entities.Content.get(existingContentId).catch(() => null);
    if (byId) existing = [byId];
  }

  if (existing.length === 0 && show?.tmdb_id) {
    existing = await entities.Content.filter({
      tmdb_id: show.tmdb_id,
    });
  }

  let contentId;

  if (existing.length > 0) {
    contentId = existing[0].id;

    const updatePayload = {
      total_seasons: isFilm ? 1 : show.total_seasons,
      total_episodes: isFilm ? 1 : show.total_episodes,
      content_type:
        show.content_type ||
        existing[0].content_type ||
        "TV_SERIES",
      source: "TMDB",
      provider: "TMDB",
      provider_id: show.tmdb_id
        ? String(show.tmdb_id)
        : existing[0].provider_id || "",
    };

    if (show.tmdb_id && !existing[0].tmdb_id) {
      updatePayload.tmdb_id = show.tmdb_id;
    }

    await entities.Content.update(contentId, updatePayload);
  } else {
    const created = await entities.Content.create({
      tmdb_id: show.tmdb_id,
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

      total_seasons: isFilm
        ? 1
        : show.total_seasons,

      total_episodes: isFilm
        ? 1
        : show.total_episodes,

      content_type:
        show.content_type || "TV_SERIES",

      source: "TMDB",
      provider: "TMDB",
      provider_id: show.tmdb_id
        ? String(show.tmdb_id)
        : "",
    });

    contentId = created.id;
  }

  /* ---------- FILM: virtual Season 1 + Episode 1 ---------- */

  if (isFilm) {
    const existingSeasons =
      await entities.Season.filter({
        content_id: contentId,
      });

    let filmSeason =
      existingSeasons.find(
        (season) =>
          Number(season.season_number) === 1
      ) || null;

    const wrongSeason =
      !filmSeason
        ? existingSeasons.find(
            (season) =>
              Number(season.season_number) === 0
          )
        : null;

    if (wrongSeason && !filmSeason) {
      await entities.Season.update(
        wrongSeason.id,
        {
          season_number: 1,
          title: "Film",
          episode_count: 1,
          poster_url:
            wrongSeason.poster_url ||
            show.poster_url ||
            "",
        }
      );
      filmSeason = { ...wrongSeason, season_number: 1 };
    }

    if (!filmSeason) {
      filmSeason = await entities.Season.create({
        content_id: contentId,
        tmdb_id: null,
        season_number: 1,
        title: "Film",
        episode_count: 1,
        poster_url:
          show.poster_url || "",
        source: "TMDB",
      });
    } else if (
      Number(filmSeason.episode_count) !== 1
    ) {
      filmSeason = await entities.Season.update(
        filmSeason.id,
        {
          episode_count: 1,
          title: filmSeason.title || "Film",
          poster_url:
            filmSeason.poster_url ||
            show.poster_url ||
            "",
        }
      );
    }

    for (const extra of existingSeasons) {
      if (Number(extra.season_number) !== 1) {
        await entities.Season.delete(extra.id);
      }
    }

    const existingEpisodes =
      await entities.Episode.filter({
        content_id: contentId,
      });

    let filmEpisode =
      existingEpisodes.find(
        (episode) =>
          Number(episode.season_number) === 1 &&
          Number(episode.episode_number) === 1
      );

    if (!filmEpisode) {
      filmEpisode = await entities.Episode.create({
        content_id: contentId,
        tmdb_id: show.tmdb_id,
        season_number: 1,
        episode_number: 1,
        title: show.title,
        description: show.summary || "",
        airdate: show.release_date || "",
        runtime: show.runtime || 0,
        image_url:
          show.poster_url || "",
      });
    }

    for (const extra of existingEpisodes) {
      if (
        Number(extra.season_number) !== 1 ||
        Number(extra.episode_number) !== 1
      ) {
        await entities.Episode.delete(extra.id);
      }
    }

    const verifyEpisodes = await entities.Episode.filter({
      content_id: contentId,
    });

    const verifySeasons = await entities.Season.filter({
      content_id: contentId,
    });

    console.log("FILM EPISODE CREATED DEBUG", {
      contentId,
      itemContentId: existingContentId || null,
      episodes: verifyEpisodes,
      seasons: verifySeasons,
    });

    return contentId;
  }

  /* ---------- persist TV / ANIME seasons ---------- */

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
        tmdb_id: season.tmdb_id,
        season_number: season.season_number,
        title: season.title,
        episode_count: season.episode_count,
        poster_url: season.poster_url,
        source: "TMDB",
      }))
    );
  }

  /* ---------- persist TV / ANIME episodes ---------- */

  if (episodes.length > 0) {
    const existingEpisodes =
      await entities.Episode.filter({
        content_id: contentId,
      });

    const existingEpKeys = new Set(
      existingEpisodes.map(
        (ep) =>
          `${ep.season_number}-${ep.episode_number}`
      )
    );

    const epsToCreate = episodes.filter(
      (ep) =>
        !existingEpKeys.has(
          `${ep.season_number}-${ep.episode_number}`
        )
    );

    if (epsToCreate.length > 0) {
      await entities.Episode.bulkCreate(
        epsToCreate.map((ep) => ({
          content_id: contentId,
          tmdb_id: ep.tmdb_id,
          season_number: ep.season_number,
          episode_number: ep.episode_number,
          title: ep.title,
          description: ep.description || "",
          airdate: ep.airdate || "",
          runtime: ep.runtime || 0,
          image_url: ep.image_url || "",
        }))
      );
    }
  }

  return contentId;
}

/* ---------- build show from stored Content ---------- */

export function showFromContentRecord(c) {
  return {
    tmdb_id: c.tmdb_id || null,
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
    source: c.source || "TMDB",
    total_seasons:
      c.content_type === "FILM"
        ? 1
        : c.total_seasons || 0,
    total_episodes:
      c.content_type === "FILM"
        ? 1
        : c.total_episodes || 0,
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

  const matches =
    await entities.EpisodeProgress.filter({
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
      await entities.EpisodeProgress.delete(
        match.id
      );
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
    existing.map((p) =>
      Number(p.episode_number)
    )
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
        watched_date:
          new Date().toISOString(),
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

export async function syncContentStatus(
  contentId
) {
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
      .filter(
        (result) => result.completed
      )
      .map(
        (result) => result.contentId
      )
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