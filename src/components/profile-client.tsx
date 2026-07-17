"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Activity, LibraryEntry, PublicUser, UserBadge } from "@/lib/types";
import { labels } from "@/lib/constants";
import { apiJson } from "./client-utils";

type Profile = {
  user: PublicUser;
  library: LibraryEntry[];
  badges: UserBadge[];
  activities: Activity[];
};

export function ProfileClient({ username }: { username: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiJson<Profile>(`/api/profile/${username}`)
      .then(setProfile)
      .catch((err: Error) => setMessage(err.message));
  }, [username]);

  if (!profile) {
    return <p className="card p-4 text-zinc-300">{message || "Caricamento profilo..."}</p>;
  }

  const equipped = profile.badges.filter((badge) => badge.equippedSlot).sort((a, b) => (a.equippedSlot ?? 0) - (b.equippedSlot ?? 0));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
        <div className="h-48 bg-zinc-950">
          {profile.user.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-full w-full object-cover" src={profile.user.bannerUrl} />
          ) : null}
        </div>
        <div className="p-6">
          <p className="text-sm font-bold uppercase tracking-wide text-violet-300">{labels.role[profile.user.role]}</p>
          <h1 className="text-4xl font-black">{profile.user.displayName}</h1>
          <p className="mt-2 text-zinc-400">@{profile.user.username}</p>
          {profile.user.bio ? <p className="mt-4 max-w-3xl text-zinc-300">{profile.user.bio}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {equipped.map((userBadge) => (
              <span className="rounded-md bg-violet-950 px-3 py-2 text-sm text-violet-100" key={userBadge.id}>
                {userBadge.badge.name}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-xl font-black">Preferiti e libreria</h2>
          <div className="mt-4 space-y-3">
            {profile.library.length ? (
              profile.library.slice(0, 8).map((entry) => (
                <Link className="block rounded-md bg-zinc-950 p-3 hover:text-violet-300" href={`/franchise/${entry.franchise?.slug}`} key={entry.id}>
                  {entry.franchise?.title} - {labels.libraryState[entry.state]}
                </Link>
              ))
            ) : (
              <p className="text-zinc-400">Libreria privata o vuota.</p>
            )}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-xl font-black">Attività</h2>
          <div className="mt-4 space-y-3">
            {profile.activities.length ? (
              profile.activities.map((activity) => (
                <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-300" key={activity.id}>
                  {activity.message}
                </p>
              ))
            ) : (
              <p className="text-zinc-400">Attività privata o assente.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
