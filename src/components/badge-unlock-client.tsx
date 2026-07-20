"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, X } from "lucide-react";
import type { PublicUser, UserBadge } from "@/lib/types";
import { apiJson } from "./client-utils";

const POLL_MS = 5000;

export function BadgeUnlockClient() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [queue, setQueue] = useState<UserBadge[]>([]);

  const loadBadges = useCallback(
    async (announce: boolean) => {
      if (!user) {
        return;
      }
      const key = `framory_seen_badges_${user.id}`;
      const payload = await apiJson<{ userBadges: UserBadge[] }>("/api/badges");
      const seen = new Set<string>(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
      const unlocked = payload.userBadges.filter((item) => !seen.has(item.badgeId));
      localStorage.setItem(key, JSON.stringify(payload.userBadges.map((item) => item.badgeId)));
      if (announce && unlocked.length) {
        setQueue((current) => [...current, ...unlocked]);
      }
    },
    [user]
  );

  useEffect(() => {
    apiJson<{ user: PublicUser | null }>("/api/me")
      .then((payload) => setUser(payload.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    loadBadges(false).catch(() => undefined);
    const refresh = () => loadBadges(true).catch(() => undefined);
    window.addEventListener("framory:badges-refresh", refresh);
    const interval = window.setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener("framory:badges-refresh", refresh);
      window.clearInterval(interval);
    };
  }, [loadBadges, user]);

  useEffect(() => {
    if (!queue.length) {
      return;
    }
    const timeout = window.setTimeout(() => setQueue((current) => current.slice(1)), 5200);
    return () => window.clearTimeout(timeout);
  }, [queue]);

  if (!queue.length) {
    return null;
  }

  const current = queue[0];
  return (
    <aside aria-live="polite" className="badge-unlock fixed bottom-5 right-5 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-violet-400/70 bg-zinc-950/95 p-4 shadow-2xl shadow-violet-950/40">
      <div className="flex items-start gap-3">
        <BadgeVisual badge={current} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase text-violet-200">Badge ottenuto</p>
          <h2 className="mt-1 text-xl text-zinc-50">{current.badge.name}</h2>
          <p className="mt-2 text-sm text-zinc-400">{current.badge.description}</p>
        </div>
        <button aria-label="Chiudi notifica badge" className="rounded-md p-1 text-zinc-400 hover:text-zinc-50" onClick={() => setQueue((items) => items.slice(1))} type="button">
          <X size={18} />
        </button>
      </div>
    </aside>
  );
}

function BadgeVisual({ badge }: { badge: UserBadge }) {
  if (badge.badge.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="" className="size-14 rounded-md object-cover" src={badge.badge.imageUrl} />
    );
  }
  return (
    <span className="grid size-14 place-items-center rounded-md bg-violet-950 text-violet-100">
      <Award size={28} />
    </span>
  );
}
