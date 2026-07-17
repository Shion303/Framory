import type { AniListImportCandidate } from "@/server/anilist";

export const ANILIST_COLLECTION_TITLE = "Opere collegate AniList";

export type ImportedEpisodeDraft = {
  title: string;
  number: number;
  duration: number | null;
  airedAt: null;
};

export type AniListImportGroup = {
  primary: AniListImportCandidate;
  candidates: AniListImportCandidate[];
  ids: number[];
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

export function flattenAniListCandidates(candidates: AniListImportCandidate[]) {
  const byId = new Map<number, AniListImportCandidate>();
  const visit = (candidate: AniListImportCandidate) => {
    if (byId.has(candidate.anilistId)) {
      return;
    }
    byId.set(candidate.anilistId, candidate);
    for (const related of candidate.relatedMedia ?? []) {
      visit(related);
    }
  };
  candidates.forEach(visit);
  return Array.from(byId.values());
}

export function groupAniListCandidates(candidates: AniListImportCandidate[]): AniListImportGroup[] {
  const nodes = flattenAniListCandidates(candidates);
  const knownIds = new Set(nodes.map((candidate) => candidate.anilistId));
  const parent = new Map<number, number>();

  const ensure = (id: number) => {
    if (!parent.has(id)) {
      parent.set(id, id);
    }
  };
  const find = (id: number): number => {
    ensure(id);
    const current = parent.get(id) as number;
    if (current === id) {
      return id;
    }
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };

  for (const candidate of nodes) {
    ensure(candidate.anilistId);
    for (const id of candidate.relationIds ?? []) {
      ensure(id);
      union(candidate.anilistId, id);
    }
    for (const related of candidate.relatedMedia ?? []) {
      ensure(related.anilistId);
      union(candidate.anilistId, related.anilistId);
    }
  }

  const groups = new Map<number, { ids: Set<number>; candidates: AniListImportCandidate[] }>();
  for (const id of parent.keys()) {
    const root = find(id);
    const group = groups.get(root) ?? { ids: new Set<number>(), candidates: [] };
    group.ids.add(id);
    groups.set(root, group);
  }
  for (const candidate of nodes) {
    const root = find(candidate.anilistId);
    groups.get(root)?.candidates.push(candidate);
  }

  return Array.from(groups.values())
    .map((group) => {
      const knownCandidates = group.candidates.filter((candidate) => knownIds.has(candidate.anilistId));
      return {
        ids: Array.from(group.ids),
        candidates: sortCandidates(knownCandidates),
        primary: sortCandidates(knownCandidates)[0]
      };
    })
    .filter((group): group is AniListImportGroup => Boolean(group.primary));
}

function sortCandidates(candidates: AniListImportCandidate[]) {
  return [...candidates].sort((a, b) => {
    const yearA = a.startYear ?? 9999;
    const yearB = b.startYear ?? 9999;
    if (yearA !== yearB) {
      return yearA - yearB;
    }
    if (a.format !== b.format) {
      return formatRank(a.format) - formatRank(b.format);
    }
    return a.title.localeCompare(b.title, "it");
  });
}

function formatRank(format: AniListImportCandidate["format"]) {
  if (format === "tv") {
    return 0;
  }
  if (format === "film") {
    return 1;
  }
  return 2;
}
