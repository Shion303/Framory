import { userAdminUpdateSchema } from "@/lib/validation";
import { requireModerator } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireModerator();
    const { id } = await context.params;
    const input = userAdminUpdateSchema.parse(await readJson(request));
    return jsonOk({ user: await getStore().updateUser(actor.id, id, input) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
