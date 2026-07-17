import { describe, expect, it } from "vitest";
import { calculateProgress } from "@/server/progress";
import type { Franchise } from "@/lib/types";

const baseFranchise: Franchise = {
  id: "franchise-1",
  slug: "re-zero",
  title: "Re:ZERO",
  description: "Franchise anime fantasy.",
  coverImage: null,
  bannerImage: null,
  genres: ["Fantasy"],
  startYear: 2016,
  status: "in_corso",
  isCompleteAdaptation: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  collections: [],
  works: [
    {
      id: "work-1",
      franchiseId: "franchise-1",
      collectionId: null,
      title: "Serie principale",
      titleRomaji: null,
      titleEnglish: null,
      titleNative: null,
      description: null,
      coverImage: null,
      bannerImage: null,
      genres: ["Fantasy"],
      startYear: 2016,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 2,
      anilistId: null,
      malId: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      seasons: [
        {
          id: "season-1",
          workId: "work-1",
          title: "Stagione 1",
          sortOrder: 0,
          episodeCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          episodes: [
            {
              id: "episode-1",
              seasonId: "season-1",
              title: "Inizio",
              number: 1,
              duration: 24,
              airedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: "episode-2",
              seasonId: "season-1",
              title: "Scelta",
              number: 2,
              duration: 24,
              airedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        }
      ]
    }
  ]
};

describe("calculateProgress", () => {
  it("calcola progresso e prossimo episodio dal basso verso l'alto", () => {
    const summary = calculateProgress(baseFranchise, [
      {
        id: "progress-1",
        userId: "user-1",
        episodeId: "episode-1",
        completed: true,
        watchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    expect(summary.completedEpisodes).toBe(1);
    expect(summary.totalEpisodes).toBe(2);
    expect(summary.percentage).toBe(50);
    expect(summary.completedEpisodeIds).toEqual(["episode-1"]);
    expect(summary.nextEpisode?.episode.id).toBe("episode-2");
    expect(summary.works[0]).toMatchObject({ completedEpisodes: 1, totalEpisodes: 2, percentage: 50 });
  });
});
