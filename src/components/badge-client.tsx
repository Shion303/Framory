"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import type { Badge, UserBadge } from "@/lib/types";
import { labels } from "@/lib/constants";
import { apiJson } from "./client-utils";

export function BadgeClient() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await apiJson<{ badges: Badge[]; userBadges: UserBadge[] }>("/api/badges");
    setBadges(payload.badges);
    setUserBadges(payload.userBadges);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  async function equip(badgeId: string, slot: number) {
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
        <p className="mt-2 text-zinc-400">Slot equipaggiati: {userBadges.filter((badge) => badge.equippedSlot).length}/3</p>
        {message ? <p className="mt-4 rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((badge) => {
          const userBadge = owned(badge.id);
          return (
            <article className="card p-5" key={badge.id}>
              <div className="flex items-start gap-3">
                <span className="rounded-md bg-violet-950 p-2 text-violet-100">
                  <Award size={22} />
                </span>
                <div>
                  <h2 className="text-xl font-black">{badge.name}</h2>
                  <p className="text-sm text-violet-200">{labels.rarity[badge.rarity]}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-zinc-400">{badge.description}</p>
              <p className="mt-3 text-sm font-bold">{userBadge ? "Sbloccato" : "Non sbloccato"}</p>
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
