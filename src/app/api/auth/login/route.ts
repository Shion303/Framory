import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { attachSessionCookie } from "@/server/auth";
import { assertRateLimit, verifyPassword } from "@/server/security";
import { getStore } from "@/server/store";
import { jsonError, readJson } from "@/server/http";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await readJson(request));
    assertRateLimit(`login:${body.email.toLowerCase()}`, 8);
    const user = await getStore().getUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new Error("Credenziali non valide.");
    }
    if (!user.isActive) {
      throw new Error("Account disattivato.");
    }
    const session = await getStore().createSession(user.id);
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return attachSessionCookie(NextResponse.json({ user: safeUser }), session.token, session.expiresAt);
  } catch (error) {
    return jsonError(error);
  }
}
