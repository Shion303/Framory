import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation";
import { attachSessionCookie } from "@/server/auth";
import { assertRateLimit, hashPassword } from "@/server/security";
import { getStore } from "@/server/store";
import { jsonError, readJson } from "@/server/http";

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await readJson(request));
    assertRateLimit(`register:${body.email.toLowerCase()}`, 5);
    const user = await getStore().createUser({
      email: body.email,
      username: body.username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password)
    });
    const session = await getStore().createSession(user.id);
    return attachSessionCookie(NextResponse.json({ user }), session.token, session.expiresAt);
  } catch (error) {
    return jsonError(error);
  }
}
