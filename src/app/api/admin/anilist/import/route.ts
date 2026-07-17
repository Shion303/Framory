import { requireAdmin } from "@/server/auth";
import { getAniListFranchiseCandidates } from "@/server/anilist";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { workSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const input = workSchema.parse(await readJson(request));
    if (input.anilistId) {
      const store = getStore();
      const candidates = await getAniListFranchiseCandidates(input.anilistId);
      if (candidates.length) {
        await store.autoImportAniListFranchises(candidates);
        return jsonOk({ franchise: await store.getFranchiseByWorkAniListId(input.anilistId) });
      }
    }
    return jsonOk({ franchise: await getStore().createWork(input, user.id) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
