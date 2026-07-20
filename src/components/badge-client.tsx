"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import type { Badge, PublicUser, UserBadge } from "@/lib/types";
import { labels } from "@/lib/constants";
import { apiJson } from "./client-utils";

export function BadgeClient() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const me = await apiJson<{ user: PublicUser | null }>("/api/me");
    setUser(me.user);
    const payload = await apiJson<{ badges: Badge[]; userBadges: UserBadge[] }>("/api/badges");
    setBadges(payload.badges);
    setUserBadges(payload.userBadges);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err: Error) => {
      setLoading(false);
      setMessage(err.message);
    });
  }, []);

  async function equip(badgeId: string, slot: number) {
    if (!user) {
      setMessage("Accedi per equipaggiare i badge.");
      return;
    }
    try {
      const payload = await apiJson<{ userBadges: UserBadge[] }>("/api/badges/equip", {
        method: "POST",
        body: JSON.stringify({ badgeId, slot })
      });
      setUserBadges(payload.userBadges);
      setMessage("Badge equipaggiato.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Operazione non riuscita.");
    }
  }

  function owned(badgeId: string) {
    return userBadges.find((item) => item.badgeId === badgeId);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-black/70 p-6">
        <h1 className="text-3xl font-black">Badge</h1>
        <p className="mt-2 text-zinc-400">{user ? `Slot equipaggiati: ${userBadges.filter((badge) => badge.equippedSlot).length}/3` : "Accedi per vedere i badge sbloccati."}</p>
        {message ? <p className="mt-4 rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
        {!loading && !user ? (
          <Link className="btn btn-primary mt-4" href="/login?next=/badge">
            Accedi
          </Link>
        ) : null}
      </section>
      {loading ? <p className="card p-4 text-zinc-300">Caricamento badge...</p> : null}
      {!loading && user && badges.length === 0 ? <p className="card p-5 text-zinc-400">Nessun badge sbloccato.</p> : null}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((badge) => {
          const userBadge = owned(badge.id);
          return (
            <article className="card p-5" key={badge.id}>
              <div className="flex items-start gap-3">
                <BadgeVisual badge={badge} />
                <div>
                  <h2 className="text-xl font-black">{badge.name}</h2>
                  <p className="text-sm text-violet-200">
                    {labels.badgeKind[badge.kind]} - {labels.rarity[badge.rarity]}{badge.ownerOnly ? " - Solo owner" : ""}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-zinc-400">{badge.description}</p>
              <p className="mt-3 text-sm font-bold">Sbloccato</p>
              {userBadge ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[1, 2, 3].map((slot) => (
                    <button className="btn btn-ghost" key={slot} onClick={() => equip(badge.id, slot)} type="button">
                      Slot {slot}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function BadgeVisual({ badge }: { badge: Badge }) {
  if (badge.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="" className="size-10 rounded-md object-cover" src={badge.imageUrl} />
    );
  }
  return (
    <span className="rounded-md bg-violet-950 p-2 text-violet-100">
      <Award size={22} />
    </span>
  );
}
