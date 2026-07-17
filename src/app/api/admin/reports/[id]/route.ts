import { requireModerator } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

const updateReportSchema = z.object({
  status: z.enum(["aperta", "risolta", "archiviata"])
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireModerator();
    const { id } = await context.params;
    const input = updateReportSchema.parse(await readJson(request));
    return jsonOk({ report: await getStore().updateReport(actor.id, id, input.status) });
  } catch (error) {
    return jsonError(error, 403);
  }
}
