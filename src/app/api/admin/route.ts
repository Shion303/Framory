import { requireModerator } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET() {
  try {
    await requireModerator();
    return jsonOk(await getStore().getAdminSnapshot());
  } catch (error) {
    return jsonError(error, 403);
  }
}
