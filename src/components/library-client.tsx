"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import type { LibraryEntry } from "@/lib/types";
import { labels, libraryStates } from "@/lib/constants";
import { apiJson } from "./client-utils";

export function LibraryClient() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    const payload = await apiJson<{ entries: LibraryEntry[] }>("/api/library");
    setEntries(payload.entries);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  async function update(entry: LibraryEntry, patch: Partial<LibraryEntry>) {
    const payload = await apiJson<{ entry: LibraryEntry }>(`/api/library/${entry.franchiseId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    setEntries((current) => current.map((item) => (item.id === entry.id ? payload.entry : item)));
  }

  async function remove(entry: LibraryEntry) {
    await apiJson(`/api/library/${entry.franchiseId}`, { method: "DELETE" });
    setEntries((current) => current.filter((item) => item.id !== entry.id));
  }

  const visible = entries.filter((entry) => entry.franchise?.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-black/70 p-6">
        <h1 className="text-3xl font-black">Libreria</h1>
        <input
          className="control mt-5 max-w-xl"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca nella libreria"
          value={query}
        />
        {message ? <p className="mt-4 rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
      </section>

      <section className="grid gap-4">
        {visible.length ? (
          visible.map((entry) => (
            <article className="card grid gap-4 p-4 lg:grid-cols-[1fr_12rem_8rem_10rem_auto]" key={entry.id}>
              <div>
                <Link className="text-xl font-black hover:text-violet-300" href={`/franchise/${entry.franchise?.slug}`}>
                  {entry.franchise?.title}
                </Link>
                <p className="mt-1 text-sm text-zinc-400">
                  Progresso {entry.progress?.completedEpisodes ?? 0}/{entry.progress?.totalEpisodes ?? 0} episodi
                </p>
              </div>
              <select
                className="control"
                onChange={(event) => update(entry, { state: event.target.value as LibraryEntry["state"] })}
                value={entry.state}
              >
                {libraryStates.map((state) => (
                  <option key={state} value={state}>
                    {labels.libraryState[state]}
                  </option>
                ))}
              </select>
              <input
                className="control"
                max={100}
                min={0}
                onChange={(event) => update(entry, { score: Number(event.target.value) })}
                placeholder="Punti"
                type="number"
                value={entry.score ?? ""}
              />
              <button className="btn btn-ghost" onClick={() => update(entry, { favorite: !entry.favorite })} type="button">
                <Heart fill={entry.favorite ? "currentColor" : "none"} size={18} /> Preferito
              </button>
              <button className="btn btn-ghost" onClick={() => remove(entry)} type="button">
                <Trash2 size={18} /> Rimuovi
              </button>
              <textarea
                className="control lg:col-span-5"
                onBlur={(event) => update(entry, { notes: event.target.value })}
                placeholder="Note personali"
                defaultValue={entry.notes ?? ""}
              />
            </article>
          ))
        ) : (
          <p className="card p-5 text-zinc-400">Nessun franchise in libreria.</p>
        )}
      </section>
    </div>
  );
}
