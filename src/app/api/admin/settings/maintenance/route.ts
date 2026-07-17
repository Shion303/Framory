import { requireAdmin } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk({ enabled: await getStore().getMaintenanceMode() });
  } catch (error) {
    return jsonError(error, 403);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAdmin();
    const body = z.object({ enabled: z.boolean() }).parse(await readJson(request));
    return jsonOk({ enabled: await getStore().setMaintenanceMode(user.id, body.enabled) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
