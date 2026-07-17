import { franchiseSchema } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await context.params;
    const input = franchiseSchema.partial().parse(await readJson(request));
    return jsonOk({ franchise: await getStore().updateFranchise(id, input, user.id) });
  } catch (error) {
    return jsonError(error, 403);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await context.params;
    await getStore().deleteFranchise(id, user.id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, 403);
  }
}
