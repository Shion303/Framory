import { requireUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    return jsonOk({ users: await getStore().searchUsers(user.id, query) });
  } catch (error) {
    return jsonError(error, 401);
  }
}
