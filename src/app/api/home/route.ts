import { getCurrentUser } from "@/server/auth";
import { ensureAniListCatalog } from "@/server/auto-import";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET() {
  try {
    const user = await getCurrentUser();
    await ensureAniListCatalog();
    return jsonOk(await getStore().getHome(user?.id));
  } catch (error) {
    return jsonError(error);
  }
}
