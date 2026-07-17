import { seasonSchema } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const input = seasonSchema.parse(await readJson(request));
    return jsonOk({ franchise: await getStore().createSeason(input, user.id) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
