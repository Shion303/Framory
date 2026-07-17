import { profileUpdateSchema } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { getStore } from "@/server/store";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = profileUpdateSchema.parse(await readJson(request));
    return jsonOk({ user: await getStore().updateProfile(user.id, input) });
  } catch (error) {
    return jsonError(error);
  }
}
