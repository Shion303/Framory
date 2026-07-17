import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = z.object({ badgeId: z.string().min(1), slot: z.number().int().min(1).max(3) }).parse(await readJson(request));
    return jsonOk({ userBadges: await getStore().equipBadge(user.id, body.badgeId, body.slot) });
  } catch (error) {
    return jsonError(error);
  }
}
