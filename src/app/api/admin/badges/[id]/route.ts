import { badgeUpdateSchema } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    const input = badgeUpdateSchema.parse(await readJson(request));
    return jsonOk({ badge: await getStore().updateBadge(actor.id, id, input) });
  } catch (error) {
    return jsonError(error, 403);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    await getStore().deleteBadge(actor.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, 403);
  }
}
