import { searchAniList } from "@/server/anilist";
import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = z.object({ query: z.string().min(2).max(120) }).parse(await readJson(request));
    return jsonOk({ results: await searchAniList(body.query) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
