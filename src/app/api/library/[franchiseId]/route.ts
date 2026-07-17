import { libraryUpdateSchema } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function PATCH(request: Request, context: { params: Promise<{ franchiseId: string }> }) {
  try {
    const user = await requireUser();
    const { franchiseId } = await context.params;
    const input = libraryUpdateSchema.parse(await readJson(request));
    return jsonOk({ entry: await getStore().updateLibrary(user.id, franchiseId, input) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ franchiseId: string }> }) {
  try {
    const user = await requireUser();
    const { franchiseId } = await context.params;
    await getStore().removeFromLibrary(user.id, franchiseId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
