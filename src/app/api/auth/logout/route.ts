import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { clearSessionCookie } from "@/server/auth";
import { getStore } from "@/server/store";
import { jsonError } from "@/server/http";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) {
      await getStore().deleteSession(token);
    }
    return clearSessionCookie(NextResponse.json({ ok: true }));
  } catch (error) {
    return jsonError(error);
  }
}
