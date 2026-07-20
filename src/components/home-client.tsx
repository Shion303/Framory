"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, Star, Trophy } from "lucide-react";
import type { HomePayload } from "@/lib/types";
import { apiJson } from "./client-utils";

export function HomeClient() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<HomePayload>("/api/home")
      .then(setHome)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <p className="card p-4 text-red-200">{error}</p>;
  }

  if (!home) {
    return <p className="card p-4 text-zinc-300">Caricamento Home...</p>;
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-zinc-800 bg-black/70 p-6 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-wide text-violet-300">Anime per franchise</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black text-zinc-50 sm:text-5xl">
            {home.user ? `Bentornato, ${home.user.displayName}` : "Organizza ogni anime dal franchise all'episodio"}
          </h1>
          <p className="mt-4 max-w-2xl text-zinc-300">
            Tutto il tuo mondo anime. Un solo posto per scoprirlo, seguirlo e completarlo.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/scopri">
              Scopri franchise <ArrowRight size={18} />
            </Link>
            <Link className="btn btn-ghost" href="/libreria">
              Apri libreria
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Stat icon={<Star size={18} />} label="Franchise in libreria" value={home.stats.libraryCount} />
          <Stat icon={<Clock size={18} />} label="Episodi completati" value={home.stats.completedEpisodes} />
          <Stat icon={<Trophy size={18} />} label="Franchise completati" value={home.stats.completedFranchises} />
          <Stat icon={<Trophy size={18} />} label="Badge sbloccati" value={home.stats.badges} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <h2 className="text-xl font-black">Continua a guardare</h2>
          {home.nextEpisode ? (
            <div className="mt-4 flex gap-3 text-zinc-300">
              <CoverImage imageUrl={home.nextEpisode.franchise.coverImage} title={home.nextEpisode.franchise.title} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-lg font-bold text-zinc-50">{home.nextEpisode.franchise.title}</p>
                <p>
                  {home.nextEpisode.work.title} - {home.nextEpisode.season.title}
                </p>
                <p>
                  Episodio {home.nextEpisode.episode.number}: {home.nextEpisode.episode.title}
                </p>
                <Link className="btn btn-primary mt-2" href={`/franchise/${home.nextEpisode.franchise.slug}`}>
                  Apri episodio
                </Link>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-zinc-400">Nessun prossimo episodio disponibile.</p>
          )}
        </div>
        <List title="Anime del momento" items={home.trending} />
        <List title="Ultimi franchise" items={home.recentFranchises} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <List title="Raccomandazioni semplici" items={home.recommendations} />
        <div className="card p-5">
          <h2 className="text-xl font-black">Attività recente</h2>
          <div className="mt-4 space-y-3">
            {home.activities.length ? (
              home.activities.map((activity) => (
                <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-300" key={activity.id}>
                  {activity.message}
                </p>
              ))
            ) : (
              <p className="text-zinc-400">Nessuna attività recente.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div aria-label={`${label}: ${value}`} className="card p-4" role="group">
      <div className="flex items-center gap-2 text-violet-300">{icon}</div>
      <p className="mt-3 text-3xl font-black text-zinc-50">{value}</p>
      <p className="text-sm text-zinc-400">{label}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: HomePayload["trending"] }) {
  return (
    <div className="card p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((franchise) => (
            <Link
              className="flex min-h-24 gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 hover:border-violet-400"
              href={`/franchise/${franchise.slug}`}
              key={franchise.id}
            >
              <CoverImage imageUrl={coverFor(franchise)} title={franchise.title} />
              <span className="min-w-0 flex-1 self-center">
                <span className="block text-zinc-50">{franchise.title}</span>
                <span className="mt-1 block text-sm text-zinc-400">{franchise.genres.slice(0, 3).join(", ") || "Anime"}</span>
              </span>
            </Link>
          ))
        ) : (
          <p className="text-zinc-400">Nessun franchise disponibile.</p>
        )}
      </div>
    </div>
  );
}

function CoverImage({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  return (
    <span className="block aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md bg-black sm:w-16">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`Copertina ${title}`} className="h-full w-full object-cover" src={imageUrl} />
      ) : (
        <span className="grid h-full w-full place-items-center px-1 text-center text-xs text-zinc-500">Framory</span>
      )}
    </span>
  );
}

function coverFor(franchise: HomePayload["trending"][number]) {
  return franchise.coverImage ?? franchise.works.find((work) => work.coverImage)?.coverImage ?? null;
}
