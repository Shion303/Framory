import { jsonOk } from "@/server/http";

export async function GET() {
  return jsonOk({
    ok: true,
    service: "framory",
    version: "1.0.0",
    time: new Date().toISOString()
  });
}
