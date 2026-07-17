import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminRoles, moderationRoles, SESSION_COOKIE } from "@/lib/constants";
import type { PublicUser } from "@/lib/types";
import { getStore } from "@/server/store";

export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return getStore().getUserBySessionToken(token);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Accesso richiesto.");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!adminRoles.includes(user.role)) {
    throw new Error("Permesso admin richiesto.");
  }
  return user;
}

export async function requireModerator() {
  const user = await requireUser();
  if (!moderationRoles.includes(user.role)) {
    throw new Error("Permesso moderazione richiesto.");
  }
  return user;
}

export function attachSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/"
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/"
  });
  return response;
}
