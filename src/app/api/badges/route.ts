import { getCurrentUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return jsonOk({ badges: [], userBadges: [] });
    }
    const payload = await getStore().listBadges(user.id);
    return jsonOk({
      badges: payload.userBadges.map((userBadge) => userBadge.badge).sort((a, b) => a.name.localeCompare(b.name, "it")),
      userBadges: payload.userBadges
    });
  } catch (error) {
    return jsonError(error);
  }
}
