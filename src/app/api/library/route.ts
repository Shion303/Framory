import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    return jsonOk({ entries: await getStore().getLibrary(user.id) });
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = z.object({ franchiseId: z.string().min(1) }).parse(await readJson(request));
    return jsonOk({ entry: await getStore().addToLibrary(user.id, body.franchiseId) });
  } catch (error) {
    return jsonError(error);
  }
}
