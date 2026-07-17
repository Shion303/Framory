import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = z.object({ userId: z.string().min(1), badgeId: z.string().min(1) }).parse(await readJson(request));
    return jsonOk({ userBadge: await getStore().grantBadge(actor.id, body.userId, body.badgeId) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
