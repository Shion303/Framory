import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = z.object({ episodeId: z.string().min(1), completed: z.boolean() }).parse(await readJson(request));
    return jsonOk({ entry: await getStore().toggleEpisode(user.id, body.episodeId, body.completed) });
  } catch (error) {
    return jsonError(error);
  }
}
