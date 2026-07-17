import type { AnimeStatus } from "@/lib/types";
import { animeStatuses } from "@/lib/constants";
import { getStore } from "@/server/store";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const year = url.searchParams.get("year");
    const sort = url.searchParams.get("sort");
    const page = url.searchParams.get("page");
    const result = await getStore().listFranchises({
      query: url.searchParams.get("query") ?? undefined,
      genre: url.searchParams.get("genre") ?? undefined,
      year: year ? Number(year) : undefined,
      status: status && animeStatuses.includes(status as AnimeStatus) ? (status as AnimeStatus) : undefined,
      sort: sort === "recent" || sort === "year" || sort === "works" || sort === "title" ? sort : "title",
      page: page ? Number(page) : 1
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
