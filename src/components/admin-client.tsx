"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BadgePlus, Download, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { Badge, Franchise, PublicUser, Report } from "@/lib/types";
import { animeStatuses, labels, roles, workFormats } from "@/lib/constants";
import { apiJson, formNumber, splitGenres } from "./client-utils";

type Snapshot = {
  users: PublicUser[];
  reports: Report[];
  franchises: Franchise[];
  badges: Badge[];
};

type AniListResult = {
  anilistId: number;
  malId?: number | null;
  title: string;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  description?: string | null;
  coverImage?: string | null;
  bannerImage?: string | null;
  genres: string[];
  startYear?: number | null;
  format: "tv" | "film" | "ova" | "ona" | "special";
  status: "annunciato" | "in_corso" | "concluso" | "in_pausa";
  duration?: number | null;
  episodeCount?: number | null;
};

export function AdminClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedFranchiseId, setSelectedFranchiseId] = useState("");
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [message, setMessage] = useState("");
  const [aniListResults, setAniListResults] = useState<AniListResult[]>([]);
  const [maintenanceMode, setMaintenanceModeState] = useState(false);

  async function load() {
    const [payload, maintenance] = await Promise.all([
      apiJson<Snapshot>("/api/admin"),
      apiJson<{ enabled: boolean }>("/api/admin/settings/maintenance")
    ]);
    setSnapshot(payload);
    setMaintenanceModeState(maintenance.enabled);
    setSelectedFranchiseId((current) => current || payload.franchises[0]?.id || "");
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  const selectedFranchise = useMemo(
    () => snapshot?.franchises.find((franchise) => franchise.id === selectedFranchiseId) ?? snapshot?.franchises[0],
    [snapshot, selectedFranchiseId]
  );
  const selectedWork = selectedFranchise?.works.find((work) => work.id === selectedWorkId) ?? selectedFranchise?.works[0];
  const selectedSeason = selectedWork?.seasons.find((season) => season.id === selectedSeasonId) ?? selectedWork?.seasons[0];

  async function submitFranchise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/franchises", {
      title: String(form.get("title")),
      description: String(form.get("description")),
      genres: splitGenres(form.get("genres")),
      startYear: formNumber(form.get("startYear")),
      status: String(form.get("status")),
      coverImage: String(form.get("coverImage") ?? ""),
      bannerImage: String(form.get("bannerImage") ?? ""),
      isCompleteAdaptation: form.get("isCompleteAdaptation") === "on"
    });
    event.currentTarget.reset();
  }

  async function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/collections", {
      franchiseId: selectedFranchiseId,
      title: String(form.get("title")),
      description: String(form.get("description") ?? ""),
      sortOrder: Number(form.get("sortOrder") || 0)
    });
    event.currentTarget.reset();
  }

  async function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/works", {
      franchiseId: selectedFranchiseId,
      collectionId: String(form.get("collectionId") || "") || null,
      title: String(form.get("title")),
      titleRomaji: String(form.get("titleRomaji") || "") || null,
      titleEnglish: String(form.get("titleEnglish") || "") || null,
      titleNative: String(form.get("titleNative") || "") || null,
      description: String(form.get("description") || "") || null,
      coverImage: String(form.get("coverImage") || "") || null,
      bannerImage: String(form.get("bannerImage") || "") || null,
      genres: splitGenres(form.get("genres")),
      startYear: formNumber(form.get("startYear")),
      format: String(form.get("format")),
      status: String(form.get("status")),
      duration: formNumber(form.get("duration")),
      episodeCount: formNumber(form.get("episodeCount")),
      sortOrder: Number(form.get("sortOrder") || 0)
    });
    event.currentTarget.reset();
  }

  async function submitSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/seasons", {
      workId: selectedWork?.id,
      title: String(form.get("title")),
      sortOrder: Number(form.get("sortOrder") || 0),
      episodeCount: formNumber(form.get("episodeCount"))
    });
    event.currentTarget.reset();
  }

  async function submitEpisode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/episodes", {
      seasonId: selectedSeason?.id,
      title: String(form.get("title")),
      number: Number(form.get("number")),
      duration: formNumber(form.get("duration")),
      airedAt: String(form.get("airedAt") || "") || null
    });
    event.currentTarget.reset();
  }

  async function mutate(url: string, body: unknown) {
    setMessage("");
    try {
      await apiJson(url, { method: "POST", body: JSON.stringify(body) });
      await load();
      setMessage("Operazione completata.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Operazione non riuscita.");
    }
  }

  async function searchAniList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("query") ?? "");
    try {
      const payload = await apiJson<{ results: AniListResult[] }>("/api/admin/anilist/search", {
        method: "POST",
        body: JSON.stringify({ query })
      });
      setAniListResults(payload.results);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ricerca AniList non riuscita.");
    }
  }

  async function importAniList(result: AniListResult) {
    await mutate("/api/admin/anilist/import", {
      ...result,
      franchiseId: selectedFranchiseId,
      collectionId: null,
      sortOrder: selectedFranchise?.works.length ?? 0
    });
  }

  async function updateUser(user: PublicUser, patch: Partial<PublicUser>) {
    try {
      await apiJson(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
      setMessage("Utente aggiornato.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Aggiornamento utente non riuscito.");
    }
  }

  async function updateReport(reportId: string, status: Report["status"]) {
    try {
      await apiJson(`/api/admin/reports/${reportId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
      setMessage("Segnalazione aggiornata.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Aggiornamento segnalazione non riuscito.");
    }
  }

  async function deleteEntity(label: string, url: string) {
    if (!window.confirm(`Confermi eliminazione sicura di ${label}?`)) {
      return;
    }
    try {
      await apiJson(url, { method: "DELETE" });
      await load();
      setMessage("Eliminazione completata.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Eliminazione non riuscita.");
    }
  }

  async function toggleMaintenance(enabled: boolean) {
    try {
      const payload = await apiJson<{ enabled: boolean }>("/api/admin/settings/maintenance", {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      setMaintenanceModeState(payload.enabled);
      setMessage(payload.enabled ? "Modalità manutenzione attivata." : "Modalità manutenzione disattivata.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Aggiornamento manutenzione non riuscito.");
    }
  }

  async function grantBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/badges/grant", {
      userId: String(form.get("userId")),
      badgeId: String(form.get("badgeId"))
    });
  }

  if (!snapshot) {
    return <p className="card p-4 text-zinc-300">{message || "Caricamento Admin..."}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-black/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-violet-300">Pannello Admin</p>
            <h1 className="text-3xl font-black">Catalogo e moderazione</h1>
          </div>
          <button className="btn btn-ghost" onClick={load} type="button">
            <RefreshCw size={18} /> Aggiorna
          </button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric label="Franchise" value={snapshot.franchises.length} />
        <Metric label="Utenti" value={snapshot.users.length} />
        <Metric label="Badge" value={snapshot.badges.length} />
        <Metric label="Segnalazioni" value={snapshot.reports.length} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Crea Franchise">
          <form className="space-y-3" onSubmit={submitFranchise}>
            <input className="control" name="title" placeholder="Titolo franchise" required />
            <textarea className="control" name="description" placeholder="Descrizione" required />
            <input className="control" name="genres" placeholder="Generi separati da virgola" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="control" name="startYear" placeholder="Anno" type="number" />
              <select className="control" name="status" defaultValue="annunciato">
                {animeStatuses.map((status) => (
                  <option key={status} value={status}>
                    {labels.animeStatus[status]}
                  </option>
                ))}
              </select>
            </div>
            <input className="control" name="coverImage" placeholder="URL cover" />
            <input className="control" name="bannerImage" placeholder="URL banner" />
            <label className="flex items-center gap-2 text-sm">
              <input name="isCompleteAdaptation" type="checkbox" /> Adattamento completo
            </label>
            <button className="btn btn-primary" type="submit">
              <Plus size={18} /> Crea
            </button>
          </form>
        </Panel>

        <Panel title="Selezione struttura">
          <div className="space-y-3">
            <select className="control" onChange={(event) => setSelectedFranchiseId(event.target.value)} value={selectedFranchise?.id ?? ""}>
              {snapshot.franchises.map((franchise) => (
                <option key={franchise.id} value={franchise.id}>
                  {franchise.title}
                </option>
              ))}
            </select>
            <select className="control" onChange={(event) => setSelectedWorkId(event.target.value)} value={selectedWork?.id ?? ""}>
              <option value="">Work</option>
              {selectedFranchise?.works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
            <select className="control" onChange={(event) => setSelectedSeasonId(event.target.value)} value={selectedSeason?.id ?? ""}>
              <option value="">Season</option>
              {selectedWork?.seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.title}
                </option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedFranchise ? (
                <button className="btn btn-ghost" onClick={() => deleteEntity(selectedFranchise.title, `/api/admin/franchises/${selectedFranchise.id}`)} type="button">
                  Elimina franchise
                </button>
              ) : null}
              {selectedWork ? (
                <button className="btn btn-ghost" onClick={() => deleteEntity(selectedWork.title, `/api/admin/works/${selectedWork.id}`)} type="button">
                  Elimina work
                </button>
              ) : null}
              {selectedSeason ? (
                <button className="btn btn-ghost" onClick={() => deleteEntity(selectedSeason.title, `/api/admin/seasons/${selectedSeason.id}`)} type="button">
                  Elimina season
                </button>
              ) : null}
              {selectedSeason?.episodes[0] ? (
                <button
                  className="btn btn-ghost"
                  onClick={() => deleteEntity(selectedSeason.episodes[0].title, `/api/admin/episodes/${selectedSeason.episodes[0].id}`)}
                  type="button"
                >
                  Elimina primo episodio
                </button>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel title="Crea Collection">
          <form className="space-y-3" onSubmit={submitCollection}>
            <input className="control" name="title" placeholder="Titolo collection" required />
            <input className="control" name="description" placeholder="Descrizione" />
            <input className="control" name="sortOrder" placeholder="Ordine" type="number" defaultValue={0} />
            <button className="btn btn-primary" type="submit">
              <Plus size={18} /> Crea
            </button>
          </form>
        </Panel>

        <Panel title="Crea Work">
          <form className="space-y-3" onSubmit={submitWork}>
            <input className="control" name="title" placeholder="Titolo opera" required />
            <input className="control" name="titleRomaji" placeholder="Titolo romaji" />
            <input className="control" name="titleEnglish" placeholder="Titolo inglese" />
            <input className="control" name="titleNative" placeholder="Titolo originale" />
            <textarea className="control" name="description" placeholder="Descrizione" />
            <select className="control" name="collectionId" defaultValue="">
              <option value="">Nessuna collection</option>
              {selectedFranchise?.collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="control" name="format" defaultValue="tv">
                {workFormats.map((format) => (
                  <option key={format} value={format}>
                    {labels.workFormat[format]}
                  </option>
                ))}
              </select>
              <select className="control" name="status" defaultValue="annunciato">
                {animeStatuses.map((status) => (
                  <option key={status} value={status}>
                    {labels.animeStatus[status]}
                  </option>
                ))}
              </select>
            </div>
            <input className="control" name="genres" placeholder="Generi" />
            <div className="grid gap-3 sm:grid-cols-4">
              <input className="control" name="startYear" placeholder="Anno" type="number" />
              <input className="control" name="duration" placeholder="Minuti" type="number" />
              <input className="control" name="episodeCount" placeholder="Episodi" type="number" />
              <input className="control" name="sortOrder" placeholder="Ordine" type="number" defaultValue={0} />
            </div>
            <input className="control" name="coverImage" placeholder="URL cover" />
            <input className="control" name="bannerImage" placeholder="URL banner" />
            <button className="btn btn-primary" type="submit">
              <Plus size={18} /> Crea
            </button>
          </form>
        </Panel>

        <Panel title="Crea Season">
          <form className="space-y-3" onSubmit={submitSeason}>
            <input className="control" name="title" placeholder="Titolo season" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="control" name="sortOrder" placeholder="Ordine" type="number" defaultValue={0} />
              <input className="control" name="episodeCount" placeholder="Episodi previsti" type="number" />
            </div>
            <button className="btn btn-primary" type="submit">
              <Plus size={18} /> Crea
            </button>
          </form>
        </Panel>

        <Panel title="Crea Episode">
          <form className="space-y-3" onSubmit={submitEpisode}>
            <input className="control" name="title" placeholder="Titolo episodio" required />
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="control" name="number" placeholder="Numero" required type="number" />
              <input className="control" name="duration" placeholder="Minuti" type="number" />
              <input className="control" name="airedAt" type="datetime-local" />
            </div>
            <button className="btn btn-primary" type="submit">
              <Plus size={18} /> Crea
            </button>
          </form>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="AniList controllato">
          <form className="flex gap-3" onSubmit={searchAniList}>
            <input className="control" name="query" placeholder="Cerca anime" required />
            <button className="btn btn-primary" type="submit">
              <Search size={18} /> Cerca
            </button>
          </form>
          <div className="mt-4 space-y-3">
            {aniListResults.map((result) => (
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3" key={result.anilistId}>
                <p className="font-bold">{result.title}</p>
                <p className="text-sm text-zinc-400">
                  {result.startYear ?? "Anno n.d."} - {labels.workFormat[result.format]}
                </p>
                <button className="btn btn-ghost mt-3" onClick={() => importAniList(result)} type="button">
                  <Download size={18} /> Importa nel franchise selezionato
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Badge manuali">
          <form className="space-y-3" onSubmit={grantBadge}>
            <select className="control" name="userId">
              {snapshot.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
            <select className="control" name="badgeId">
              {snapshot.badges.map((badge) => (
                <option key={badge.id} value={badge.id}>
                  {badge.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">
              <BadgePlus size={18} /> Assegna
            </button>
          </form>
        </Panel>
      </section>

      <Panel title="Gestione utenti">
        <div className="grid gap-3">
          {snapshot.users.map((user) => (
            <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 md:grid-cols-[1fr_10rem_10rem_auto]" key={user.id}>
              <div>
                <p className="font-bold">{user.displayName}</p>
                <p className="text-sm text-zinc-400">{user.email ?? user.username}</p>
              </div>
              <select className="control" onChange={(event) => updateUser(user, { role: event.target.value as PublicUser["role"] })} value={user.role}>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {labels.role[role]}
                  </option>
                ))}
              </select>
              <select
                className="control"
                onChange={(event) => updateUser(user, { isActive: event.target.value === "true" })}
                value={String(user.isActive)}
              >
                <option value="true">Attivo</option>
                <option value="false">Disattivato</option>
              </select>
              <span className="flex items-center gap-2 text-sm text-zinc-300">
                <ShieldCheck size={18} /> {labels.role[user.role]}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Impostazioni piattaforma">
        <label className="flex items-center gap-3 text-sm font-bold">
          <input checked={maintenanceMode} onChange={(event) => toggleMaintenance(event.target.checked)} type="checkbox" />
          Modalità manutenzione
        </label>
      </Panel>

      <Panel title="Segnalazioni">
        <div className="grid gap-3">
          {snapshot.reports.length ? (
            snapshot.reports.map((report) => (
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 md:grid-cols-[1fr_10rem]" key={report.id}>
                <div>
                  <p className="font-bold">{report.targetType}: {report.targetId}</p>
                  <p className="text-sm text-zinc-400">{report.reason}</p>
                </div>
                <select className="control" onChange={(event) => updateReport(report.id, event.target.value as Report["status"])} value={report.status}>
                  <option value="aperta">Aperta</option>
                  <option value="risolta">Risolta</option>
                  <option value="archiviata">Archiviata</option>
                </select>
              </div>
            ))
          ) : (
            <p className="text-zinc-400">Nessuna segnalazione aperta.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-3xl font-black text-zinc-50">{value}</p>
    </div>
  );
}
