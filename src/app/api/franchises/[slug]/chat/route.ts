import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const franchise = await getStore().getFranchiseBySlug(slug);
    if (!franchise) {
      return jsonError(new Error("Franchise non trovato."), 404);
    }
    return jsonOk({ messages: await getStore().getFranchiseChat(user.id, franchise.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await context.params;
    const franchise = await getStore().getFranchiseBySlug(slug);
    if (!franchise) {
      return jsonError(new Error("Franchise non trovato."), 404);
    }
    const body = z.object({ body: z.string().min(1).max(1000) }).parse(await readJson(request));
    return jsonOk({ message: await getStore().sendFranchiseChatMessage(user.id, franchise.id, body.body) });
  } catch (error) {
    return jsonError(error);
  }
}
