import type { EpisodeProgress, Franchise, ProgressSummary } from "@/lib/types";

export function calculateProgress(franchise: Franchise, progressRows: EpisodeProgress[]): ProgressSummary {
  const completed = new Set(progressRows.filter((row) => row.completed).map((row) => row.episodeId));
  let totalEpisodes = 0;
  let completedEpisodes = 0;
  let nextEpisode: ProgressSummary["nextEpisode"];
  const works: ProgressSummary["works"] = [];

  for (const work of franchise.works) {
    let workTotal = 0;
    let workCompleted = 0;
    for (const season of work.seasons) {
      const orderedEpisodes = [...season.episodes].sort((a, b) => a.number - b.number);
      for (const episode of orderedEpisodes) {
        totalEpisodes += 1;
        workTotal += 1;
        if (completed.has(episode.id)) {
          completedEpisodes += 1;
          workCompleted += 1;
        } else if (!nextEpisode) {
          nextEpisode = {
            episode,
            season,
            work,
            franchise: {
              id: franchise.id,
              slug: franchise.slug,
              title: franchise.title,
              coverImage: franchise.coverImage
            }
          };
        }
      }
    }
    works.push({
      workId: work.id,
      completedEpisodes: workCompleted,
      totalEpisodes: workTotal,
      percentage: workTotal === 0 ? 0 : Math.round((workCompleted / workTotal) * 100)
    });
  }

  return {
    completedEpisodes,
    totalEpisodes,
    percentage: totalEpisodes === 0 ? 0 : Math.round((completedEpisodes / totalEpisodes) * 100),
    completedEpisodeIds: Array.from(completed),
    nextEpisode,
    works
  };
}
