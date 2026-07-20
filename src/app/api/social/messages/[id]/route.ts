import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return jsonOk({ messages: await getStore().getPrivateMessages(user.id, id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = z.object({ body: z.string().min(1).max(1000) }).parse(await readJson(request));
    return jsonOk({ message: await getStore().sendPrivateMessage(user.id, id, body.body) });
  } catch (error) {
    return jsonError(error);
  }
}
