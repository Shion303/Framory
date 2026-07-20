"use client";

import { FormEvent, useEffect, useState } from "react";
import { BadgePlus, Download, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { Badge, BadgeCategory, BadgeConditionKind, BadgeKind, BadgeRarity, Franchise, PublicUser, Report } from "@/lib/types";
import { badgeCategories, badgeConditionKinds, badgeKinds, badgeRarities, labels, roles } from "@/lib/constants";
import { apiJson, formNumber } from "./client-utils";

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

type BadgePayload = {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  rarity: BadgeRarity;
  category: BadgeCategory;
  kind: BadgeKind;
  conditionKind: BadgeConditionKind;
  conditionValue: number | null;
  ownerOnly: boolean;
};

export function AdminClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [aniListResults, setAniListResults] = useState<AniListResult[]>([]);
  const [badgeUserQuery, setBadgeUserQuery] = useState("");
  const [selectedBadgeUserId, setSelectedBadgeUserId] = useState("");
  const [maintenanceMode, setMaintenanceModeState] = useState(false);

  async function load() {
    const [payload, maintenance] = await Promise.all([
      apiJson<Snapshot>("/api/admin"),
      apiJson<{ enabled: boolean }>("/api/admin/settings/maintenance")
    ]);
    setSnapshot(payload);
    setMaintenanceModeState(maintenance.enabled);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  async function mutate(url: string, body: unknown, successMessage = "Operazione completata.") {
    setMessage("");
    try {
      await apiJson(url, { method: "POST", body: JSON.stringify(body) });
      await load();
      setMessage(successMessage);
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
      setMessage(payload.results.length ? "Risultati AniList aggiornati." : "Nessun risultato AniList trovato.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ricerca AniList non riuscita.");
    }
  }

  async function importAniList(result: AniListResult) {
    await mutate("/api/admin/anilist/import", { anilistId: result.anilistId }, "Import AniList completato.");
  }

  async function submitBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await mutate(
      "/api/admin/badges",
      {
        slug: String(form.get("slug")),
        name: String(form.get("name")),
        description: String(form.get("description")),
        imageUrl: String(form.get("imageUrl") ?? "") || null,
        rarity: String(form.get("rarity")),
        category: String(form.get("category")),
        kind: String(form.get("kind")),
        conditionKind: String(form.get("conditionKind")),
        conditionValue: formNumber(form.get("conditionValue")),
        ownerOnly: form.get("ownerOnly") === "on"
      },
      "Badge creato."
    );
    formElement.reset();
  }

  async function saveBadge(badgeId: string, patch: BadgePayload) {
    try {
      await apiJson(`/api/admin/badges/${badgeId}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
      setMessage("Badge aggiornato.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Aggiornamento badge non riuscito.");
    }
  }

  async function deleteBadge(badge: Badge) {
    if (!window.confirm(`Eliminare il badge ${badge.name}?`)) {
      return;
    }
    try {
      await apiJson(`/api/admin/badges/${badge.id}`, { method: "DELETE" });
      await load();
      setMessage("Badge eliminato.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Eliminazione badge non riuscita.");
    }
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

  async function toggleMaintenance(enabled: boolean) {
    try {
      const payload = await apiJson<{ enabled: boolean }>("/api/admin/settings/maintenance", {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      setMaintenanceModeState(payload.enabled);
      setMessage(payload.enabled ? "Modalita manutenzione attivata." : "Modalita manutenzione disattivata.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Aggiornamento manutenzione non riuscito.");
    }
  }

  async function grantBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBadgeUserId) {
      setMessage("Seleziona un utente dalla ricerca.");
      return;
    }
    const form = new FormData(event.currentTarget);
    await mutate(
      "/api/admin/badges/grant",
      {
        userId: selectedBadgeUserId,
        badgeId: String(form.get("badgeId"))
      },
      "Badge assegnato."
    );
  }

  if (!snapshot) {
    return <p className="card p-4 text-zinc-300">{message || "Caricamento Admin..."}</p>;
  }

  const selectedBadgeUser = snapshot.users.find((user) => user.id === selectedBadgeUserId);
  const badgeUserNeedle = badgeUserQuery.trim().toLowerCase();
  const badgeUserResults =
    badgeUserNeedle.length >= 2
      ? snapshot.users
          .filter((user) =>
            [user.displayName, user.username, user.email ?? ""].some((value) => value.toLowerCase().includes(badgeUserNeedle))
          )
          .slice(0, 8)
      : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-black/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-violet-300">Pannello Admin</p>
            <h1 className="text-3xl font-black">Moderazione e automazioni</h1>
          </div>
          <button className="btn btn-ghost" onClick={load} type="button">
            <RefreshCw size={18} /> Aggiorna
          </button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric label="Franchise automatici" value={snapshot.franchises.length} />
        <Metric label="Utenti" value={snapshot.users.length} />
        <Metric label="Badge" value={snapshot.badges.length} />
        <Metric label="Segnalazioni" value={snapshot.reports.length} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Import AniList">
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
                  <Download size={18} /> Importa nel franchise automatico
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Crea badge">
          <form className="space-y-3" onSubmit={submitBadge}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="control" name="name" placeholder="Nome badge" required />
              <input className="control" name="slug" placeholder="slug-badge" required />
            </div>
            <input className="control" name="imageUrl" placeholder="URL immagine badge" />
            <textarea className="control" name="description" placeholder="Descrizione" required />
            <BadgeFields />
            <label className="flex items-center gap-2 text-sm font-bold">
              <input name="ownerOnly" type="checkbox" /> Solo owner
            </label>
            <button className="btn btn-primary" type="submit">
              <Plus size={18} /> Crea badge
            </button>
          </form>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Badge manuali">
          <form className="space-y-3" onSubmit={grantBadge}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  className="control min-w-0 flex-1"
                  onChange={(event) => {
                    setBadgeUserQuery(event.target.value);
                    setSelectedBadgeUserId("");
                  }}
                  placeholder="Cerca utente"
                  value={badgeUserQuery}
                />
                <Search className="mt-3 text-zinc-400" size={18} />
              </div>
              {selectedBadgeUser ? (
                <div className="rounded-md border border-violet-500 bg-violet-950/35 p-3 text-sm">
                  <p className="text-zinc-50">{selectedBadgeUser.displayName}</p>
                  <p className="text-zinc-400">@{selectedBadgeUser.username}</p>
                </div>
              ) : badgeUserNeedle.length >= 2 ? (
                <div className="space-y-2">
                  {badgeUserResults.length ? (
                    badgeUserResults.map((user) => (
                      <button
                        className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left text-sm hover:border-violet-400"
                        key={user.id}
                        onClick={() => {
                          setSelectedBadgeUserId(user.id);
                          setBadgeUserQuery(user.displayName);
                        }}
                        type="button"
                      >
                        <span className="block text-zinc-50">{user.displayName}</span>
                        <span className="text-zinc-400">@{user.username}</span>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-400">Nessun utente trovato.</p>
                  )}
                </div>
              ) : (
                <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-400">Cerca e seleziona un utente.</p>
              )}
            </div>
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

        <Panel title="Badge esistenti">
          <div className="grid gap-3">
            {snapshot.badges.map((badge) => (
              <BadgeEditor badge={badge} key={badge.id} onDelete={deleteBadge} onSave={saveBadge} />
            ))}
          </div>
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
          Modalita manutenzione
        </label>
      </Panel>

      <Panel title="Segnalazioni">
        <div className="grid gap-3">
          {snapshot.reports.length ? (
            snapshot.reports.map((report) => (
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 md:grid-cols-[1fr_10rem]" key={report.id}>
                <div>
                  <p className="font-bold">
                    {report.targetType}: {report.targetId}
                  </p>
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

function BadgeFields({ value, onChange }: { value?: BadgePayload; onChange?: (patch: Partial<BadgePayload>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <select
        className="control"
        name="rarity"
        onChange={(event) => onChange?.({ rarity: event.target.value as BadgeRarity })}
        {...(value ? { value: value.rarity } : { defaultValue: "comune" })}
      >
        {badgeRarities.map((rarity) => (
          <option key={rarity} value={rarity}>
            {labels.rarity[rarity]}
          </option>
        ))}
      </select>
      <select
        className="control"
        name="category"
        onChange={(event) => onChange?.({ category: event.target.value as BadgeCategory })}
        {...(value ? { value: value.category } : { defaultValue: "tracking" })}
      >
        {badgeCategories.map((category) => (
          <option key={category} value={category}>
            {labels.badgeCategory[category]}
          </option>
        ))}
      </select>
      <select
        className="control"
        name="conditionKind"
        onChange={(event) => onChange?.({ conditionKind: event.target.value as BadgeConditionKind })}
        {...(value ? { value: value.conditionKind } : { defaultValue: "manual" })}
      >
        {badgeConditionKinds.map((condition) => (
          <option key={condition} value={condition}>
            {labels.badgeCondition[condition]}
          </option>
        ))}
      </select>
      <select
        className="control"
        name="kind"
        onChange={(event) => onChange?.({ kind: event.target.value as BadgeKind })}
        {...(value ? { value: value.kind } : { defaultValue: "standard" })}
      >
        {badgeKinds.map((kind) => (
          <option key={kind} value={kind}>
            {labels.badgeKind[kind]}
          </option>
        ))}
      </select>
      <input
        className="control"
        name="conditionValue"
        onChange={(event) => onChange?.({ conditionValue: event.target.value ? Number(event.target.value) : null })}
        placeholder="Soglia"
        type="number"
        value={value ? (value.conditionValue ?? "") : undefined}
      />
    </div>
  );
}

function BadgeEditor({
  badge,
  onDelete,
  onSave
}: {
  badge: Badge;
  onDelete: (badge: Badge) => void;
  onSave: (badgeId: string, patch: BadgePayload) => void;
}) {
  const [draft, setDraft] = useState<BadgePayload>(() => badgeToPayload(badge));

  useEffect(() => {
    setDraft(badgeToPayload(badge));
  }, [badge]);

  function patchDraft(patch: Partial<BadgePayload>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <form
      aria-label={`Editor badge ${badge.slug}`}
      className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(badge.id, draft);
      }}
    >
      <div className="flex items-center gap-3">
        <BadgeImage badge={draft} />
        <div>
          <p className="text-sm font-bold text-zinc-200">{draft.ownerOnly ? "Solo owner" : "Disponibile agli utenti"}</p>
          <p className="text-xs text-zinc-500">Anteprima badge</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input aria-label="Nome badge" className="control" onChange={(event) => patchDraft({ name: event.target.value })} value={draft.name} />
        <input aria-label="Slug badge" className="control" onChange={(event) => patchDraft({ slug: event.target.value })} value={draft.slug} />
      </div>
      <input
        aria-label="URL immagine badge"
        className="control"
        onChange={(event) => patchDraft({ imageUrl: event.target.value || null })}
        placeholder="URL immagine badge"
        value={draft.imageUrl ?? ""}
      />
      <textarea aria-label="Descrizione badge" className="control" onChange={(event) => patchDraft({ description: event.target.value })} value={draft.description} />
      <BadgeFields onChange={patchDraft} value={draft} />
      <label className="flex items-center gap-2 text-sm font-bold">
        <input checked={draft.ownerOnly} onChange={(event) => patchDraft({ ownerOnly: event.target.checked })} type="checkbox" /> Solo owner
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">
          <Save size={18} /> Salva
        </button>
        <button className="btn btn-ghost" onClick={() => onDelete(badge)} type="button">
          <Trash2 size={18} /> Elimina
        </button>
      </div>
    </form>
  );
}

function badgeToPayload(badge: Badge): BadgePayload {
  return {
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    imageUrl: badge.imageUrl ?? null,
    rarity: badge.rarity,
    category: badge.category,
    kind: badge.kind,
    conditionKind: badge.conditionKind,
    conditionValue: badge.conditionValue ?? null,
    ownerOnly: badge.ownerOnly
  };
}

function BadgeImage({ badge }: { badge: Pick<BadgePayload, "imageUrl" | "name"> }) {
  if (!badge.imageUrl) {
    return <span className="grid size-12 place-items-center rounded-md bg-violet-950 text-sm font-black text-violet-100">B</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className="size-12 rounded-md object-cover" src={badge.imageUrl} />
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
