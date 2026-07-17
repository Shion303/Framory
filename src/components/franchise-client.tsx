"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Library, Plus } from "lucide-react";
import type { Franchise, LibraryEntry } from "@/lib/types";
import { labels } from "@/lib/constants";
import { apiJson } from "./client-utils";

type Payload = { franchise: Franchise; library: LibraryEntry | null };

export function FranchiseClient({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiJson<Payload>(`/api/franchises/${slug}`)
      .then(setPayload)
      .catch((err: Error) => setMessage(err.message));
  }, [slug]);

  async function addToLibrary() {
    if (!payload) {
      return;
    }
    const result = await apiJson<{ entry: LibraryEntry }>("/api/library", {
      method: "POST",
      body: JSON.stringify({ franchiseId: payload.franchise.id })
    });
    setPayload({ ...payload, library: result.entry });
    setMessage("Franchise aggiunto alla libreria.");
  }

  async function toggleEpisode(episodeId: string, completed: boolean) {
    setCompletedOverrides((current) => ({ ...current, [episodeId]: completed }));
    try {
      const result = await apiJson<{ entry: LibraryEntry }>("/api/progress/toggle", {
        method: "POST",
        body: JSON.stringify({ episodeId, completed })
      });
      setPayload((current) => (current ? { ...current, library: result.entry } : current));
      setCompletedOverrides((current) => {
        const next = { ...current };
        delete next[episodeId];
        return next;
      });
    } catch (err) {
      setCompletedOverrides((current) => ({ ...current, [episodeId]: !completed }));
      setMessage(err instanceof Error ? err.message : "Tracking non riuscito.");
    }
  }

  if (!payload) {
    return <p className="card p-4 text-zinc-300">{message || "Caricamento franchise..."}</p>;
  }

  const { franchise, library } = payload;
  const progress = library?.progress;
  const completedIds = new Set(progress?.completedEpisodeIds ?? []);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
        <div className="h-56 bg-zinc-950">
          {franchise.bannerImage || franchise.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-full w-full object-cover" src={franchise.bannerImage ?? franchise.coverImage ?? undefined} />
          ) : null}
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-[12rem_1fr_auto]">
          <div className="aspect-[2/3] overflow-hidden rounded-lg bg-zinc-950">
            {franchise.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="h-full w-full object-cover" src={franchise.coverImage} />
            ) : null}
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-violet-300">{labels.animeStatus[franchise.status]}</p>
            <h1 className="mt-2 text-4xl font-black text-zinc-50">{franchise.title}</h1>
            <p className="mt-4 max-w-3xl text-zinc-300">{franchise.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {franchise.genres.map((genre) => (
                <span className="rounded-md bg-violet-950 px-2 py-1 text-sm text-violet-100" key={genre}>
                  {genre}
                </span>
              ))}
            </div>
          </div>
          <div className="min-w-48 space-y-3">
            {library ? (
              <div className="card p-4">
                <p className="text-sm text-zinc-400">Progresso</p>
                <p className="text-3xl font-black">{progress?.percentage ?? 0}%</p>
                <p className="text-sm text-zinc-400">
                  {progress?.completedEpisodes ?? 0}/{progress?.totalEpisodes ?? 0} episodi
                </p>
              </div>
            ) : (
              <button className="btn btn-primary w-full" onClick={addToLibrary} type="button">
                <Plus size={18} /> Aggiungi
              </button>
            )}
          </div>
        </div>
      </section>

      {message ? <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}

      <section className="space-y-4">
        <h2 className="text-2xl font-black">Struttura del franchise</h2>
        {franchise.works.length ? (
          franchise.works.map((work) => (
            <article className="card p-5" key={work.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase text-violet-300">{labels.workFormat[work.format]}</p>
                  <h3 className="text-2xl font-black">{work.title}</h3>
                </div>
                <span className="rounded-md bg-zinc-950 px-3 py-2 text-sm text-zinc-300">{labels.animeStatus[work.status]}</span>
              </div>
              <div className="mt-4 space-y-4">
                {work.seasons.length ? (
                  work.seasons.map((season) => (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4" key={season.id}>
                      <h4 className="font-bold">{season.title}</h4>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {season.episodes.length ? (
                          season.episodes.map((episode) => {
                            const isCompleted = completedOverrides[episode.id] ?? completedIds.has(episode.id);
                            return (
                              <label
                                className="flex min-h-14 items-center gap-3 rounded-md border border-zinc-800 bg-black p-3 text-sm"
                                key={episode.id}
                              >
                                <input
                                  aria-label={`Segna episodio ${episode.number}`}
                                  checked={isCompleted}
                                  disabled={!library}
                                  onChange={(event) => toggleEpisode(episode.id, event.target.checked)}
                                  type="checkbox"
                                />
                                <span className="flex-1">
                                  {episode.number}. {episode.title}
                                </span>
                                {isCompleted ? <CheckCircle2 className="text-violet-300" size={18} /> : null}
                              </label>
                            );
                          })
                        ) : (
                          <p className="text-sm text-zinc-400">Nessun episodio registrato.</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-400">Nessuna stagione registrata.</p>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="card p-5 text-zinc-400">Nessuna opera registrata.</p>
        )}
        {!library ? (
          <p className="flex items-center gap-2 rounded-md bg-zinc-950 p-3 text-sm text-zinc-400">
            <Library size={18} /> Aggiungi il franchise alla libreria per tracciare gli episodi.
          </p>
        ) : null}
      </section>
    </div>
  );
}
