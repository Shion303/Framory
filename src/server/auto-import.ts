import type { FranchiseFilters } from "@/lib/types";
import { getTrendingAniList, searchAniList } from "@/server/anilist";
import { getStore } from "@/server/store";

export type AniListAutoImportResult = {
  attempted: boolean;
  imported: number;
  warning?: string;
};

function importLimit(limit?: number) {
  return Math.max(1, Math.min(50, Math.round(limit ?? 12)));
}

function warningFrom(error: unknown) {
  return error instanceof Error ? error.message : "Importazione automatica AniList non riuscita.";
}

export async function ensureAniListCatalog(filters: FranchiseFilters = {}, options?: { limit?: number }): Promise<AniListAutoImportResult> {
  if (process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT === "1") {
    return { attempted: false, imported: 0 };
  }

  const store = getStore();
  const query = filters.query?.trim();

  if (!query) {
    const currentCatalog = await store.listFranchises({ page: 1 });
    if (currentCatalog.total > 0) {
      return { attempted: false, imported: 0 };
    }
  }

  try {
    const limit = importLimit(options?.limit);
    const candidates = query ? await searchAniList(query) : await getTrendingAniList(limit);
    const imported = await store.autoImportAniListFranchises(candidates.slice(0, limit));
    return { attempted: true, imported: imported.length };
  } catch (error) {
    return { attempted: true, imported: 0, warning: warningFrom(error) };
  }
}
