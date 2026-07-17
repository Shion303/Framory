import type { Franchise, FranchiseFilters } from "@/lib/types";

export function franchiseMatchesQuery(franchise: Franchise, query: string) {
  const rawQuery = query.trim().toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  if (!rawQuery) {
    return true;
  }

  const values = [
    franchise.title,
    franchise.description,
    ...franchise.genres,
    ...franchise.collections.flatMap((collection) => [collection.title, collection.description ?? ""]),
    ...franchise.works.flatMap((work) => [
      work.title,
      work.titleRomaji ?? "",
      work.titleEnglish ?? "",
      work.titleNative ?? "",
      work.description ?? "",
      ...work.genres,
      ...work.seasons.flatMap((season) => [season.title, ...season.episodes.map((episode) => episode.title)])
    ])
  ];

  return values.some((value) => containsQuery(value, rawQuery, normalizedQuery));
}

export function sortFranchises(items: Franchise[], sort: FranchiseFilters["sort"]) {
  return [...items].sort((a, b) => {
    if (sort === "year") {
      return (b.startYear ?? 0) - (a.startYear ?? 0);
    }
    if (sort === "works") {
      return b.works.length - a.works.length;
    }
    if (sort === "recent") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.title.localeCompare(b.title, "it");
  });
}

export function paginateFranchises(items: Franchise[], page: number, pageSize = 12) {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

function containsQuery(value: string, rawQuery: string, normalizedQuery: string) {
  const lowerValue = value.toLowerCase();
  return lowerValue.includes(rawQuery) || (normalizedQuery.length > 0 && normalizeSearchText(value).includes(normalizedQuery));
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
