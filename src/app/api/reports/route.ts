import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { z } from "zod";

const reportSchema = z.object({
  targetType: z.string().min(2).max(40),
  targetId: z.string().min(1).max(120),
  reason: z.string().min(10).max(1000)
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = reportSchema.parse(await readJson(request));
    return jsonOk({ report: await getStore().createReport(user.id, input) });
  } catch (error) {
    return jsonError(error);
  }
}
