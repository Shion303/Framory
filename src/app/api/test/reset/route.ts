import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST() {
  try {
    await getStore().resetForTests();
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, 403);
  }
}
