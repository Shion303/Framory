"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Compass, Home, Library, LogIn, LogOut, Settings, Shield } from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { adminRoles } from "@/lib/constants";
import { apiJson } from "./client-utils";

export function Nav() {
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    apiJson<{ user: PublicUser | null }>("/api/me")
      .then((payload) => setUser(payload.user))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await apiJson("/api/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/82 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link className="text-xl font-black text-zinc-50" href="/">
          Framory
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link className="btn btn-ghost" href="/" title="Home">
            <Home size={18} /> Home
          </Link>
          <Link className="btn btn-ghost" href="/scopri" title="Discovery">
            <Compass size={18} /> Scopri
          </Link>
          <Link className="btn btn-ghost" href="/libreria" title="Libreria">
            <Library size={18} /> Libreria
          </Link>
          <Link className="btn btn-ghost" href="/badge" title="Badge">
            <Award size={18} /> Badge
          </Link>
          {user && adminRoles.includes(user.role) ? (
            <Link className="btn btn-ghost" href="/admin" title="Admin">
              <Shield size={18} /> Admin
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link className="btn btn-ghost" href={`/profilo/${user.username}`}>
                {user.displayName}
              </Link>
              <Link className="btn btn-ghost" href="/impostazioni" title="Impostazioni">
                <Settings size={18} />
              </Link>
              <button className="btn btn-primary" onClick={logout} type="button">
                <LogOut size={18} /> Esci
              </button>
            </>
          ) : (
            <Link className="btn btn-primary" href="/login">
              <LogIn size={18} /> Entra
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
