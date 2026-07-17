import type { FranchiseFilters } from "@/lib/types";
import { getAniListFranchiseCandidates, getTrendingAniList, searchAniList } from "@/server/anilist";
import { getStore } from "@/server/store";
import type { FramoryStore } from "@/server/store/types";

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

let lastExistingRelationSyncAt = 0;

export async function ensureAniListCatalog(filters: FranchiseFilters = {}, options?: { limit?: number }): Promise<AniListAutoImportResult> {
  if (process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT === "1") {
    return { attempted: false, imported: 0 };
  }

  const store = getStore();
  const query = filters.query?.trim();

  if (!query) {
    const currentCatalog = await store.listFranchises({ page: 1 });
    if (currentCatalog.total > 0) {
      return syncExistingAniListRelations(store, options);
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

async function syncExistingAniListRelations(store: FramoryStore, options?: { limit?: number }): Promise<AniListAutoImportResult> {
  const now = Date.now();
  const intervalMs = Number(process.env.FRAMORY_ANILIST_RELATION_SYNC_INTERVAL_MS ?? 300000);
  if (now - lastExistingRelationSyncAt < Math.max(30000, intervalMs)) {
    return { attempted: false, imported: 0 };
  }
  lastExistingRelationSyncAt = now;

  try {
    const ids = await store.listAniListWorkIds(Math.min(importLimit(options?.limit), 4));
    if (!ids.length) {
      return { attempted: false, imported: 0 };
    }
    const groups = await Promise.all(ids.map((id) => getAniListFranchiseCandidates(id)));
    const synced = await store.autoImportAniListFranchises(groups.flat());
    return { attempted: true, imported: synced.length };
  } catch (error) {
    return { attempted: true, imported: 0, warning: warningFrom(error) };
  }
}
