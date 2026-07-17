import type { AniListImportCandidate } from "@/server/anilist";

export type ImportedEpisodeDraft = {
  title: string;
  number: number;
  duration: number | null;
  airedAt: null;
};

export function anilistEpisodeCap(options?: { episodeCap?: number }) {
  const fromEnv = Number(process.env.FRAMORY_ANILIST_EPISODE_IMPORT_LIMIT ?? "");
  const raw = options?.episodeCap ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 200);
  return Math.max(1, Math.min(5000, Math.round(raw)));
}

export function franchiseDescription(candidate: AniListImportCandidate) {
  return candidate.description?.trim() || "Franchise anime importato automaticamente da AniList.";
}

export function seasonTitle(candidate: AniListImportCandidate) {
  return candidate.format === "film" ? "Film" : "Stagione 1";
}

export function episodeDrafts(candidate: AniListImportCandidate, cap: number): ImportedEpisodeDraft[] {
  const total = candidate.format === "film" ? 1 : Math.max(0, candidate.episodeCount ?? 0);
  const count = Math.min(total, cap);
  return Array.from({ length: count }, (_, index) => ({
    title: candidate.format === "film" ? candidate.title : `Episodio ${index + 1}`,
    number: index + 1,
    duration: candidate.duration,
    airedAt: null
  }));
}
