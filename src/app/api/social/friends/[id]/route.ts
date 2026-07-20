import { requireUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await getStore().removeFriend(user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
