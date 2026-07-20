import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = z.object({ action: z.enum(["accept", "decline"]) }).parse(await readJson(request));
    return jsonOk({ request: await getStore().respondFriendRequest(user.id, id, body.action) });
  } catch (error) {
    return jsonError(error);
  }
}
