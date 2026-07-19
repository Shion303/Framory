import { badgeSchema } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const input = badgeSchema.parse(await readJson(request));
    return jsonOk({ badge: await getStore().createBadge(actor.id, input) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
