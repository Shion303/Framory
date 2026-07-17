import { getCurrentUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const franchise = await getStore().getFranchiseBySlug(slug);
    if (!franchise) {
      return jsonError(new Error("Franchise non trovato."), 404);
    }
    const user = await getCurrentUser();
    const library = user ? (await getStore().getLibrary(user.id)).find((entry) => entry.franchiseId === franchise.id) : null;
    return jsonOk({ franchise, library });
  } catch (error) {
    return jsonError(error);
  }
}
