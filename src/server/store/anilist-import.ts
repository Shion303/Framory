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
  const keyOwners = new Map<string, number>();

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
    for (const key of animeTitleKeysForCandidate(candidate)) {
      const owner = keyOwners.get(key);
      if (owner) {
        union(candidate.anilistId, owner);
      } else {
        keyOwners.set(key, candidate.anilistId);
      }
      for (const [existingKey, existingOwner] of keyOwners.entries()) {
        if (keysAreCompatible(key, existingKey)) {
          union(candidate.anilistId, existingOwner);
        }
      }
    }
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

export function animeTitleKeysForCandidate(candidate: AniListImportCandidate) {
  return animeTitleKeysForValues([candidate.title, candidate.titleRomaji, candidate.titleEnglish, candidate.titleNative]);
}

export function animeTitleKeysForValues(values: Array<string | null | undefined>) {
  const keys = new Set<string>();
  for (const value of values) {
    const root = titleRoot(value ?? "");
    const normalizedRoot = normalizeTitle(root);
    const normalizedFull = normalizeTitle(value ?? "");
    if (normalizedRoot.length >= 4) {
      keys.add(normalizedRoot);
    }
    if (normalizedFull.length >= 4) {
      keys.add(normalizedFull);
    }
  }
  return Array.from(keys);
}

export function titleKeysOverlap(first: string[], second: string[]) {
  return first.some((left) => second.some((right) => keysAreCompatible(left, right)));
}

function titleRoot(value: string) {
  return value
    .replace(/\([^)]*\)/g, " ")
    .split(/\s*[:：]\s*/)[0]
    .replace(/\b(?:season|stagione|cour|part|parte)\s*\d+.*$/i, "")
    .replace(/\b(?:season|stagione)\s+(?:one|two|three|four|five).*$/i, "")
    .replace(/\b(?:final season|the final season).*$/i, "")
    .trim();
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function keysAreCompatible(first: string, second: string) {
  if (first === second) {
    return true;
  }
  const shorter = first.length <= second.length ? first : second;
  const longer = first.length > second.length ? first : second;
  return shorter.length >= 6 && longer.startsWith(shorter);
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
