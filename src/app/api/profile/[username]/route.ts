import { getCurrentUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await context.params;
    const viewer = await getCurrentUser();
    const profile = await getStore().getPublicProfile(username, viewer?.id);
    if (!profile) {
      return jsonError(new Error("Profilo non trovato."), 404);
    }
    return jsonOk(profile);
  } catch (error) {
    return jsonError(error);
  }
}
