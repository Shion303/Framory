import type { AnimeStatus, FranchiseFilters } from "@/lib/types";
import { animeStatuses } from "@/lib/constants";
import { ensureAniListCatalog } from "@/server/auto-import";
import { getStore } from "@/server/store";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const year = url.searchParams.get("year");
    const sort = url.searchParams.get("sort");
    const page = url.searchParams.get("page");
    const selectedSort: FranchiseFilters["sort"] =
      sort === "recent" || sort === "year" || sort === "works" || sort === "title" ? sort : "title";
    const filters: FranchiseFilters = {
      query: url.searchParams.get("query") ?? undefined,
      genre: url.searchParams.get("genre") ?? undefined,
      year: year ? Number(year) : undefined,
      status: status && animeStatuses.includes(status as AnimeStatus) ? (status as AnimeStatus) : undefined,
      sort: selectedSort,
      page: page ? Number(page) : 1
    };
    const store = getStore();
    let result = await store.listFranchises(filters);
    let autoImport = { attempted: false, imported: 0 };

    if (result.total === 0 || !filters.query) {
      autoImport = await ensureAniListCatalog(filters);
      if (autoImport.imported > 0) {
        result = await store.listFranchises(filters);
      }
    }

    return jsonOk({ ...result, autoImport });
  } catch (error) {
    return jsonError(error);
  }
}
