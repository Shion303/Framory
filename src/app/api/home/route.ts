import { getCurrentUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return jsonOk(await getStore().getHome(user?.id));
  } catch (error) {
    return jsonError(error);
  }
}
