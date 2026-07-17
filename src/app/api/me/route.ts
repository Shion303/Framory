import { getCurrentUser } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
  try {
    return jsonOk({ user: await getCurrentUser() });
  } catch (error) {
    return jsonError(error);
  }
}
