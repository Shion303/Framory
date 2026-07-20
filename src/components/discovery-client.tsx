"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Franchise } from "@/lib/types";
import { animeStatuses, labels } from "@/lib/constants";
import { apiJson } from "./client-utils";

type Result = {
  items: Franchise[];
  total: number;
  page: number;
  pageSize: number;
  autoImport?: {
    attempted: boolean;
    imported: number;
    warning?: string;
  };
};

export function DiscoveryClient() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  async function load(params = "") {
    const payload = await apiJson<Result>(`/api/franchises${params}`);
    setResult(payload);
    if (payload.autoImport?.warning) {
      setMessage(`AniList: ${payload.autoImport.warning}`);
    } else if (payload.autoImport?.imported) {
      setMessage(`${payload.autoImport.imported} franchise importati o sincronizzati da AniList.`);
    } else {
      setMessage("");
    }
  }

  useEffect(() => {
    setReady(true);
    load("?sort=recent").catch((err: Error) => setMessage(err.message));
  }, []);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const formElement = event?.currentTarget ?? formRef.current;
    if (!formElement) {
      return;
    }
    const form = new FormData(formElement);
    const params = new URLSearchParams();
    for (const key of ["query", "genre", "year", "status", "sort"]) {
      const value = String(form.get(key) ?? "");
      if (value) {
        params.set(key, value);
      }
    }
    await load(`?${params.toString()}`);
  }

  async function add(franchiseId: string) {
    setMessage("");
    try {
      await apiJson("/api/library", { method: "POST", body: JSON.stringify({ franchiseId }) });
      setMessage("Franchise aggiunto alla libreria.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Operazione non riuscita.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-black/70 p-6">
        <h1 className="text-3xl font-black">Discovery</h1>
        <form className="mt-5 grid gap-3 md:grid-cols-[1fr_0.7fr_0.4fr_0.5fr_0.5fr_auto]" onSubmit={submit} ref={formRef}>
          <input
            className="control"
            name="query"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca franchise"
            value={query}
          />
          <input className="control" name="genre" placeholder="Genere" />
          <input className="control" name="year" min={1900} max={2100} placeholder="Anno" type="number" />
          <select className="control" name="status">
            <option value="">Stato</option>
            {animeStatuses.map((status) => (
              <option key={status} value={status}>
                {labels.animeStatus[status]}
              </option>
            ))}
          </select>
          <select className="control" name="sort">
            <option value="title">Titolo</option>
            <option value="recent">Recenti</option>
            <option value="year">Anno</option>
            <option value="works">Opere</option>
          </select>
          <button className="btn btn-primary" data-ready={ready ? "true" : "false"} onClick={() => void submit()} type="button">
            <Search size={18} /> Cerca
          </button>
        </form>
        {message ? <p className="mt-4 rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result?.items.length ? (
          result.items.map((franchise) => (
            <article className="card overflow-hidden" key={franchise.id}>
              <div className="h-32 bg-zinc-950">
                {franchise.bannerImage || franchise.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={franchise.bannerImage ?? franchise.coverImage ?? undefined}
                  />
                ) : null}
              </div>
              <div className="space-y-3 p-4">
                <Link className="text-xl font-black text-zinc-50 hover:text-violet-300" href={`/franchise/${franchise.slug}`}>
                  {franchise.title}
                </Link>
                <p className="line-clamp-3 text-sm text-zinc-400">{franchise.description}</p>
                <p className="text-sm text-violet-200">{franchise.genres.slice(0, 4).join(", ") || "Anime"}</p>
                <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                  <p className="font-bold text-zinc-100">{franchise.works.length || 1} opere nella stessa card</p>
                  {franchise.works.length ? <p className="mt-1 line-clamp-2">{franchise.works.slice(0, 4).map((work) => work.title).join(", ")}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn btn-ghost" href={`/franchise/${franchise.slug}`}>
                    Apri
                  </Link>
                  <button className="btn btn-primary" onClick={() => add(franchise.id)} type="button">
                    <Plus size={18} /> Libreria
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="card p-5 text-zinc-400">Nessun franchise trovato.</p>
        )}
      </section>
    </div>
  );
}
