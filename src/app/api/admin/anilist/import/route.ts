import { requireAdmin } from "@/server/auth";
import { getAniListFranchiseCandidates } from "@/server/anilist";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

const importSchema = z.object({
  anilistId: z.number().int().positive()
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = importSchema.parse(await readJson(request));
    const store = getStore();
    const candidates = await getAniListFranchiseCandidates(input.anilistId);
    if (!candidates.length) {
      throw new Error("AniList non ha restituito serie importabili.");
    }
    await store.autoImportAniListFranchises(candidates);
    return jsonOk({ franchise: await store.getFranchiseByWorkAniListId(input.anilistId) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
