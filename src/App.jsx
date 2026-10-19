import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, ChevronLeft, ChevronRight, Film, GripVertical, Home, Loader2, Play, Plus, RefreshCw, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { db, searchGroups, defaultEntry, activeItems, computeStatus, STATUS_STYLES, MANUAL_STATUS, providerGetMedia, buildFranchise, previewParts, loadAllEpisodes, titleKey, syncLibrary, orderedParts, partItemsMap, reorderParts, reorderPartItems } from "./framory";

const DEBOUNCE_MS = 400;
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 60;
const SYNC_INTERVAL = 30 * 60 * 1000;
const SYNC_CHECK = 5 * 60 * 1000;
const PART_STATE = { finished: "Uscito", airing: "In uscita", upcoming: "Prossimamente", unknown: "Data TBA" };

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [franchises, setFranchises] = useState({});
  const [entries, setEntries] = useState({});
  const [detailId, setDetailId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState([]);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const fRef = useRef({});
  const eRef = useRef({});
  const syncRef = useRef(false);
  const searchSeq = useRef(0);
  const cacheRef = useRef(new Map());

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const runSync = useCallback(async (auto) => {
    if (syncRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { if (!auto) showToast("Offline - nessuna sincronizzazione"); return; }
    syncRef.current = true;
    setSyncing(true);
    try {
      const { changed } = await syncLibrary(Object.values(fRef.current));
      if (changed.length) {
        const next = { ...fRef.current };
        for (const fr of changed) next[fr.id] = fr;
        fRef.current = next;
        setFranchises({ ...next });
        showToast(auto ? `WatchList aggiornata (${changed.length})` : `Sincronizzato (${changed.length})`);
      } else if (!auto) {
        showToast("Tutto aggiornato");
      }
      await db.meta.put({ key: "lastSync", value: Date.now() });
      setLastSync(Date.now());
    } catch (e) {
      console.warn("[sync]", e);
      if (!auto) showToast("Errore sincronizzazione");
    }
    syncRef.current = false;
    setSyncing(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fr, er, ls] = await Promise.all([db.franchises.toArray(), db.entries.toArray(), db.meta.get("lastSync")]);
        const fm = {}, em = {};
        fr.forEach((r) => { fm[r.id] = r; });
        er.forEach((r) => { em[r.franchiseId] = r; });
        fRef.current = fm;
        eRef.current = em;
        if (cancelled) return;
        setFranchises(fm);
        setEntries(em);
        setLastSync(ls?.value || null);
      } catch (e) { console.error("[load]", e); }
      if (cancelled) return;
      setReady(true);
      setTimeout(() => { if (!cancelled) runSync(true); }, 350);
    })();
    return () => { cancelled = true; };
  }, [runSync]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => { if (Date.now() - (lastSync || 0) > SYNC_INTERVAL) runSync(true); }, SYNC_CHECK);
    return () => clearInterval(id);
  }, [ready, lastSync, runSync]);

  const doSearch = useCallback(async (raw) => {
    const q = (raw || "").trim();
    if (q.length < 2) { setGroups([]); setSearching(false); return; }
    const hit = cacheRef.current.get(q.toLowerCase());
    if (hit && Date.now() - hit.t < CACHE_TTL) { setGroups(hit.g); setSearching(false); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const g = await searchGroups(q);
      cacheRef.current.set(q.toLowerCase(), { g, t: Date.now() });
      if (cacheRef.current.size > CACHE_MAX) cacheRef.current.delete(cacheRef.current.keys().next().value);
      if (seq === searchSeq.current) setGroups(g);
    } catch (e) {
      console.warn("[search]", e);
      if (seq === searchSeq.current) { setGroups([]); showToast("Errore ricerca"); }
    }
    if (seq === searchSeq.current) setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  const putEntry = async (fid, en) => {
    const next = { ...en, updatedAt: Date.now() };
    await db.entries.put(next);
    eRef.current = { ...eRef.current, [fid]: next };
    setEntries({ ...eRef.current });
  };
  const patchEntry = (fid, fn) => putEntry(fid, fn(eRef.current[fid] || defaultEntry(fid)));
  const toggleCheck = (fid, itemId) => patchEntry(fid, (en) => {
    const s = new Set(en.checked || []);
    if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
    return { ...en, checked: [...s] };
  });
  const removeItem = (fid, itemId) => patchEntry(fid, (en) => ({ ...en, removed: [...new Set([...(en.removed || []), itemId])] }));
  const setStatus = (fid, key) => patchEntry(fid, (en) => ({ ...en, status: key === "auto" ? null : key }));
  const reorderPart = (fid, from, to) => patchEntry(fid, (en) => reorderParts(fRef.current[fid], en, from, to));
  const reorderItem = (fid, partId, from, to) => patchEntry(fid, (en) => reorderPartItems(fRef.current[fid], en, partId, from, to));

  const findExisting = useCallback((gr) => {
    if (!gr) return null;
    const k = titleKey(gr.title);
    const ids = new Set(gr.memberIds || []);
    const hit = Object.entries(fRef.current).find(([, f]) => f && (titleKey(f.title) === k || (f.memberIds || []).some((id) => ids.has(id))));
    return hit ? hit[0] : null;
  }, []);

  const addToWatchlist = async (gr) => {
    if (findExisting(gr)) { showToast("Gia nella WatchList"); return; }
    setAdding(gr.key);
    try {
      const meds = await providerGetMedia(gr.memberIds);
      if (!meds.length) { showToast("Impossibile caricare i dati"); return; }
      const fr = buildFranchise(meds, gr.title);
      if (fRef.current[fr.id]) { showToast("Gia nella WatchList"); return; }
      await loadAllEpisodes(fr.parts);
      await db.franchises.put(fr);
      fRef.current = { ...fRef.current, [fr.id]: fr };
      setFranchises({ ...fRef.current });
      await putEntry(fr.id, defaultEntry(fr.id));
      showToast("Aggiunto alla WatchList");
      setPreview(null);
    } catch (e) {
      console.warn("[add]", e);
      showToast("Errore aggiunta");
    } finally {
      setAdding(null);
    }
  };

  const removeFromWatchlist = async (fid) => {
    try {
      await db.franchises.delete(fid);
      await db.entries.delete(fid);
      const nf = { ...fRef.current };
      const ne = { ...eRef.current };
      delete nf[fid];
      delete ne[fid];
      fRef.current = nf;
      eRef.current = ne;
      setFranchises({ ...nf });
      setEntries({ ...ne });
      setDetailId(null);
      setPreview(null);
      showToast("Rimosso dalla WatchList");
    } catch (e) { console.warn("[remove]", e); showToast("Errore rimozione"); }
  };

  const list = useMemo(
    () => Object.entries(entries).map(([fid, en]) => ({ fid, en, fr: franchises[fid] })).filter((x) => x.fr).sort((a, b) => b.en.addedAt - a.en.addedAt),
    [franchises, entries],
  );
  const previewFid = useMemo(() => findExisting(preview), [preview, franchises, findExisting]);

  if (!ready) return <div className="min-h-screen bg-[#0b0b0f] text-zinc-100 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-300" /></div>;

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-zinc-100 pb-20">
      <div className="px-3 pt-3 flex items-center justify-between safe-top">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-300" />
          <div className="text-base font-semibold">Framory</div>
          {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => runSync(false)} disabled={syncing} aria-label="Sincronizza" className="p-2 rounded-full bg-white/5 disabled:opacity-60">{syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
          <button onClick={() => setSettingsOpen(true)} aria-label="Impostazioni" className="p-2 rounded-full bg-white/5"><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="mt-2">
        {tab === "home" && <HomeTab list={list} onOpen={setDetailId} onGoDiscovery={() => setTab("discovery")} />}
        {tab === "discovery" && <DiscoveryTab search={search} setSearch={setSearch} groups={groups} searching={searching} onOpen={setPreview} />}
        {tab === "watchlist" && <WatchlistTab list={list} onOpen={setDetailId} />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0b0b0f]/90 backdrop-blur border-t border-white/5">
        <div className="grid grid-cols-3 h-14 pb-safe">
          <TabBtn active={tab === "home"} onClick={() => setTab("home")} icon={Home} label="Home" />
          <TabBtn active={tab === "discovery"} onClick={() => setTab("discovery")} icon={Search} label="Discovery" />
          <TabBtn active={tab === "watchlist"} onClick={() => setTab("watchlist")} icon={Bookmark} label="Watchlist" />
        </div>
      </div>

      {detailId && franchises[detailId] && entries[detailId] && (
        <Detail
          fr={franchises[detailId]} en={entries[detailId]} fid={detailId}
          onClose={() => setDetailId(null)}
          onCheck={toggleCheck} onRemoveItem={removeItem}
          onSetStatus={setStatus} onReorderPart={reorderPart} onReorderItem={reorderItem}
          onDelete={() => removeFromWatchlist(detailId)}
        />
      )}
      {preview && (
        <DiscoveryModal
          gr={preview} exists={previewFid} existsEn={previewFid ? entries[previewFid] : null}
          busy={adding === preview.key} onClose={() => setPreview(null)}
          onAdd={addToWatchlist} onRemove={removeFromWatchlist} onSetStatus={setStatus}
        />
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onExport={exportData} onImport={importData} lastSync={lastSync} />}

      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#141317]/95 border border-white/10 text-xs transition-all ${toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}>{toast}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return <button onClick={onClick} className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${active ? "text-violet-300" : "text-zinc-500"}`}><Icon className="w-4 h-4" /><span>{label}</span></button>;
}

function Poster({ src, alt, className = "", rounded = "rounded-2xl" }) {
  const [state, setState] = useState(src ? "loading" : "empty");
  useEffect(() => { setState(src ? "loading" : "empty"); }, [src]);
  if (!src) return <div className={`${className} ${rounded} bg-white/[0.06] flex items-center justify-center overflow-hidden`}><Film className="w-5 h-5 text-zinc-600" /></div>;
  return (
    <div className={`${className} ${rounded} relative overflow-hidden bg-white/[0.06]`}>
      {state !== "ok" && <div className="absolute inset-0 animate-pulse bg-white/[0.07]" />}
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("ok")}
        onError={() => setState("err")}
        className={`w-full h-full object-cover transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
      />
      {state === "err" && <div className="absolute inset-0 flex items-center justify-center"><Film className="w-5 h-5 text-zinc-600" /></div>}
    </div>
  );
}

function Empty({ icon: Icon, title, desc, action }) {
  return <div className="flex flex-col items-center justify-center py-20 text-center px-6"><div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4"><Icon className="w-6 h-6 text-zinc-500" /></div><p className="font-medium mb-1">{title}</p>{desc && <p className="text-sm text-zinc-500 mb-4 max-w-sm">{desc}</p>}{action}</div>;
}
function Loading({ label }) { return <div className="flex flex-col items-center justify-center py-20 text-zinc-500"><Loader2 className="w-6 h-6 animate-spin mb-3" /><p className="text-sm">{label}</p></div>; }

function HomeTab({ list, onOpen, onGoDiscovery }) {
  const watching = list.filter((x) => { const s = computeStatus(x.fr, x.en); return s.key === "watching" || s.key === "ongoing" || s.key === "completed"; });
  return (
    <div className="px-3 pt-3 flex flex-col gap-5">
      <section>
        <div className="text-sm font-medium mb-2 flex items-center gap-1"><Play className="w-4 h-4" />Continua a guardare</div>
        {watching.length === 0 ? (
          <Empty icon={Play} title="Nessun anime in visione" desc="Vai su Discovery per cercare un titolo." action={<button onClick={onGoDiscovery} className="px-4 py-2 rounded-2xl bg-violet-500/20 border border-violet-400/40 text-violet-200 text-sm">Vai su Discovery</button>} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{watching.map((x) => <Card key={x.fid} x={x} onOpen={onOpen} />)}</div>
        )}
      </section>
    </div>
  );
}

function Card({ x, onOpen }) {
  const s = computeStatus(x.fr, x.en);
  const items = activeItems(x.fr, x.en);
  const next = items.find((i) => !(x.en.checked || []).includes(i.id));
  return (
    <button onClick={() => onOpen(x.fid)} className="w-full flex gap-3 p-2 rounded-2xl bg-[#141317]/70 border border-white/5 text-left hover:border-white/10 active:scale-[0.995] transition">
      <Poster src={x.fr.cover} alt={x.fr.title} className="w-20 shrink-0 aspect-[2/3]" />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="text-sm font-medium line-clamp-1">{x.fr.title}</div>
        <div className="text-[11px] text-zinc-400 mt-0.5">{s.done}/{s.total} - {s.pct}%</div>
        <div className={`mt-1 text-[10px] px-1.5 py-0.5 rounded-full border w-fit ${STATUS_STYLES[s.key]}`}>{s.label}</div>
        {next && <div className="mt-auto text-[11px] text-zinc-500 line-clamp-1 pt-1">Prossimo: {next.title}</div>}
      </div>
      <div className="self-center"><Check className="w-4 h-4 text-zinc-500" /></div>
    </button>
  );
}

function DiscoveryTab({ search, setSearch, groups, searching, onOpen }) {
  const empty = groups.length === 0;
  return (
    <div className="px-3 pt-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca anime (MAL / AniList)"
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-[#141317]/70 border border-white/5 text-sm outline-none focus:border-violet-400/40"
        />
      </div>
      {searching && <Loading label="Ricerca in corso..." />}
      {!searching && empty && search.trim().length >= 2 && <Empty icon={Search} title="Nessun risultato" desc="Prova con un altro titolo." />}
      {!searching && empty && search.trim().length < 2 && <Empty icon={Sparkles} title="Cerca un anime" desc="Digita almeno 2 caratteri per iniziare la ricerca." />}
      <div className="mt-3 flex flex-col gap-2">
        {groups.map((gr) => <DiscoveryCard key={gr.key} gr={gr} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function DiscoveryCard({ gr, onOpen }) {
  return (
    <button onClick={() => onOpen(gr)} className="w-full text-left rounded-2xl bg-[#141317]/70 border border-white/5 p-2 flex gap-3 hover:border-white/10 active:scale-[0.995] transition">
      <Poster src={gr.cover} alt={gr.title} className="w-20 shrink-0 aspect-[2/3]" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold line-clamp-1">{gr.title}</div>
        <div className="text-[10px] text-zinc-400">{gr.memberIds.length} media{gr.preview?.length ? ` - ${gr.preview.join(" / ")}` : ""}{gr.year ? ` - ${gr.year}` : ""}</div>
        <div className="text-[11px] text-zinc-500 line-clamp-3 mt-1">{gr.synopsis}</div>
      </div>
      <ChevronRight className="w-4 h-4 self-center text-zinc-600 shrink-0" />
    </button>
  );
}

const STATUS_OPTIONS = [
  { k: "auto", label: "Automatico" },
  { k: "watching", label: "Sto Guardando" },
  { k: "ongoing", label: "In Corso" },
  { k: "completed", label: "Completata" },
  { k: "hold", label: "In Pausa / Pianificato" },
];

function StatusPicker({ en, onSetStatus, compact }) {
  const current = en?.status && MANUAL_STATUS[en.status] ? en.status : "auto";
  return (
    <div className={`flex gap-1.5 overflow-x-auto pb-0.5 ${compact ? "" : "-mx-1 px-1"}`}>
      {STATUS_OPTIONS.map((o) => {
        const active = current === o.k;
        return (
          <button
            key={o.k}
            onClick={() => onSetStatus(o.k)}
            className={`shrink-0 px-2.5 py-1.5 rounded-full border text-[11px] whitespace-nowrap transition ${active ? STATUS_STYLES[o.k] || "bg-violet-500 text-white border-violet-400" : "border-white/10 bg-white/[0.04] text-zinc-400"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DiscoveryModal({ gr, exists, existsEn, busy, onClose, onAdd, onRemove, onSetStatus }) {
  const parts = useMemo(() => previewParts(gr.members || []), [gr]);
  const total = parts.reduce((n, p) => n + (p.episodes || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-[#121216] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl pb-4">
        <div className="sticky top-0 z-10 flex items-center justify-center pt-2 pb-1 bg-[#121216]/90 backdrop-blur rounded-t-3xl">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <button onClick={onClose} aria-label="Chiudi" className="absolute top-3 right-3 p-2 rounded-full bg-white/5 border border-white/10"><X className="w-4 h-4" /></button>

        <div className="px-4 flex gap-4">
          <Poster src={gr.cover} alt={gr.title} className="w-28 shrink-0 aspect-[2/3]" />
          <div className="min-w-0 pt-1">
            <div className="text-base font-semibold leading-snug">{gr.title}</div>
            <div className="text-[11px] text-zinc-400 mt-1">{parts.length} elementi{gr.year ? ` - ${gr.year}` : ""}</div>
            {!!gr.preview?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {gr.preview.map((p) => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/15 bg-white/5 text-zinc-300">{p}</span>)}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 mt-4">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Trama</div>
          <p className="text-[13px] leading-relaxed text-zinc-300 whitespace-pre-line">{gr.synopsis || "Nessuna trama disponibile."}</p>
        </div>

        <div className="px-4 mt-4">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Stagioni, film e OVA</div>
          <div className="flex flex-col gap-1.5">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${p.finished ? "bg-violet-500 border-violet-400" : "border-white/20"}`}>{p.finished && <Check className="w-3.5 h-3.5" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] line-clamp-1">{p.title}</div>
                  <div className="text-[10px] text-zinc-500">{p.label}{p.episodes ? ` - ${p.episodes} ep` : ""}{p.year ? ` - ${p.year}` : ""}</div>
                </div>
                <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full border ${p.finished ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10" : p.status === "airing" ? "border-sky-400/40 text-sky-300 bg-sky-400/10" : "border-white/15 text-zinc-400"}`}>{PART_STATE[p.status] || "Data TBA"}</span>
              </div>
            ))}
            {!parts.length && <div className="text-xs text-zinc-500">Nessun elemento trovato.</div>}
          </div>
          {total > 0 && <div className="text-[11px] text-zinc-500 mt-2">{total} episodi complessivi</div>}
        </div>

        {exists && existsEn && (
          <div className="px-4 mt-4">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Stato</div>
            <StatusPicker en={existsEn} onSetStatus={(k) => onSetStatus(exists, k)} />
          </div>
        )}

        <div className="sticky bottom-0 mt-5 px-4 pt-2 pb-1 bg-[#121216]/90 backdrop-blur">
          {exists ? (
            <button onClick={() => onRemove(exists)} disabled={busy} className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-medium text-red-300 flex items-center justify-center gap-2 disabled:opacity-60">
              <Trash2 className="w-4 h-4" />Rimuovi dalla WatchList
            </button>
          ) : (
            <button onClick={() => onAdd(gr)} disabled={busy} className="w-full py-3 rounded-2xl bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Aggiunta in corso...</> : <><Plus className="w-4 h-4" />Aggiungi alla WatchList</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WatchlistTab({ list, onOpen }) {
  if (!list.length) return <Empty icon={Bookmark} title="WatchList vuota" desc="Vai su Discovery e aggiungi il tuo primo titolo." />;
  return (
    <div className="px-3 pt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {list.map((x) => {
        const s = computeStatus(x.fr, x.en);
        return (
          <button key={x.fid} onClick={() => onOpen(x.fid)} className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden border border-white/5 bg-[#141317]/70 text-left active:scale-[0.99] transition">
            <Poster src={x.fr.cover} alt={x.fr.title} rounded="rounded-none" className="absolute inset-0 w-full h-full" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2 pb-2 pt-8">
              <div className="text-xs font-medium line-clamp-1">{x.fr.title}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[s.key]}`}>{s.label}</span>
                <span className="text-[9px] text-zinc-400">{s.pct}%</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Detail({ fr, en, fid, onClose, onCheck, onRemoveItem, onSetStatus, onReorderPart, onReorderItem, onDelete }) {
  const [openId, setOpenId] = useState(() => (fr.parts || [])[0]?.id ?? null);
  const [drag, setDrag] = useState(null);
  const [touch, setTouch] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const parts = useMemo(() => orderedParts(fr, en), [fr, en]);
  const map = useMemo(() => partItemsMap(fr, en), [fr, en]);
  const checkedSet = useMemo(() => new Set(en.checked || []), [en.checked]);
  const s = computeStatus(fr, en);

  useEffect(() => {
    const first = (fr.parts || [])[0]?.id ?? null;
    setOpenId((cur) => (cur && (fr.parts || []).some((p) => p.id === cur) ? cur : first));
  }, [fr.id, fr.parts]);

  const onTouchStart = (e) => { const t = e.touches[0]; setTouch({ x: t.clientX, y: t.clientY }); };
  const onTouchEnd = (e, id) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touch.y);
    if (dx < -60 && dy < 40) onRemoveItem(fid, id);
    setTouch(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0b0f]/95 backdrop-blur-xl overflow-y-auto">
      <div className="min-h-full pb-24">
        <div className="relative h-44">
          <Poster src={fr.banner || fr.cover} alt={fr.title} rounded="rounded-none" className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0f] via-[#0b0b0f]/45 to-transparent" />
          <button onClick={onClose} aria-label="Indietro" className="absolute top-3 left-3 p-2 rounded-full bg-black/40 border border-white/10"><ChevronLeft className="w-4 h-4" /></button>
          <div className="absolute bottom-3 left-3 right-3 flex items-end gap-3">
            <Poster src={fr.cover} alt={fr.title} className="w-16 shrink-0 aspect-[2/3]" />
            <div className="flex-1 min-w-0 pb-0.5">
              <div className="text-base font-semibold line-clamp-2 leading-snug">{fr.title}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{s.done}/{s.total} - {s.pct}%</div>
            </div>
          </div>
        </div>

        <div className="px-3 mt-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Stato</div>
          <StatusPicker en={en} onSetStatus={(k) => onSetStatus(fid, k)} compact />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.key]}`}>{s.label}</span>
            {s.manual && <span className="text-[10px] text-zinc-500">impostato manualmente</span>}
          </div>
        </div>

        <div className="px-3 mt-5">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-sm font-medium">Stagioni, film e OVA</div>
            <div className="text-[11px] text-zinc-500">{parts.length} gruppi</div>
          </div>
          <div className="text-[11px] text-zinc-500 mb-2">Tocca un gruppo per gli episodi. Trascina i gruppi per riordinarli, scorri a sinistra su un episodio per eliminarlo.</div>
          <div className="flex flex-col gap-2">
            {parts.map((p, pi) => {
              const items = map[p.id] || [];
              const done = items.filter((i) => checkedSet.has(i.id)).length;
              const isOpen = openId === p.id;
              const pct = items.length ? Math.round((done / items.length) * 100) : 0;
              return (
                <div key={p.id} className="rounded-2xl bg-[#141317]/70 border border-white/5 overflow-hidden">
                  <div
                    draggable
                    onDragStart={() => setDrag({ type: "part", from: pi })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (drag && drag.type === "part") onReorderPart(fid, drag.from, pi); setDrag(null); }}
                    className="flex items-stretch"
                  >
                    <button onClick={() => setOpenId(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex-1 flex items-center gap-3 p-2 text-left active:bg-white/[0.03]">
                      <Poster src={p.cover || fr.cover} alt={p.title} className="w-14 shrink-0 aspect-[2/3]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium line-clamp-1">{p.label}</div>
                        <div className="text-[11px] text-zinc-400 line-clamp-1">{p.title}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{done}/{items.length} ep{p.year ? ` - ${p.year}` : ""}</div>
                        <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-violet-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 shrink-0 text-zinc-600 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    <div className="flex items-center pr-2 cursor-grab"><GripVertical className="w-4 h-4 text-zinc-600" /></div>
                  </div>
                  {isOpen && (
                    <div className="px-2 pb-2 flex flex-col gap-1.5">
                      {items.length === 0 ? (
                        <div className="px-2 py-5 text-center text-[11px] text-zinc-500">Nessun episodio disponibile.</div>
                      ) : items.map((it, ii) => {
                        const checked = checkedSet.has(it.id);
                        return (
                          <div
                            key={it.id}
                            onTouchStart={onTouchStart}
                            onTouchEnd={(e) => onTouchEnd(e, it.id)}
                            draggable
                            onDragStart={() => setDrag({ type: "item", partId: p.id, from: ii })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => { if (drag && drag.type === "item" && drag.partId === p.id) onReorderItem(fid, p.id, drag.from, ii); setDrag(null); }}
                            className={`flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/5 ${checked ? "opacity-60" : ""}`}
                          >
                            <button onClick={() => onCheck(fid, it.id)} aria-label="Spunta episodio" className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center ${checked ? "bg-violet-500 border-violet-400" : "border-white/20"}`}>{checked && <Check className="w-4 h-4" />}</button>
                            <Poster src={it.thumb} alt={it.title} className="w-20 shrink-0 aspect-video" rounded="rounded-lg" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[12.5px] leading-snug line-clamp-2">{it.title}</div>
                              <div className="text-[10px] text-zinc-500 mt-0.5">Ep. {it.n}{it.durationMin ? ` - ${it.durationMin} min` : ""}</div>
                            </div>
                            <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />
                            <button onClick={() => onRemoveItem(fid, it.id)} aria-label="Elimina episodio" className="p-1 text-zinc-500"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {!parts.length && <Empty icon={Film} title="Nessun elemento" desc="Gli episodi appariranno qui dopo la sincronizzazione." />}
          </div>
        </div>

        <div className="px-3 mt-6">
          {confirmDel ? (
            <div className="rounded-2xl bg-red-500/10 border border-red-400/30 p-3">
              <div className="text-sm text-red-200 mb-2">Rimuovere definitivamente tutta l'opera e i dati locali dalla WatchList?</div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDel(false)} className="flex-1 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm">Annulla</button>
                <button onClick={onDelete} className="flex-1 py-2 rounded-2xl bg-red-500 text-white text-sm font-medium">Rimuovi</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="w-full py-2.5 rounded-2xl bg-white/5 border border-white/10 text-sm text-red-300 flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" />Rimuovi dalla WatchList
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSheet({ onClose, onExport, onImport, lastSync }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0b0b0f]/95 backdrop-blur-xl overflow-y-auto">
      <div className="min-h-full pb-20">
        <div className="px-3 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><Settings className="w-4 h-4" /><span className="text-sm font-medium">Impostazioni</span></div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 rounded-full bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-3 mt-4 flex flex-col gap-3">
          <div className="rounded-2xl bg-[#141317]/70 border border-white/5 p-3">
            <div className="text-sm font-medium mb-2">Sincronizzazione</div>
            <div className="text-[11px] text-zinc-400">Ultimo aggiornamento: {lastSync ? new Date(lastSync).toLocaleString() : "Mai"}</div>
            <div className="text-[11px] text-zinc-500 mt-1">La WatchList viene aggiornata automaticamente ogni volta che apri l'app, in secondo piano.</div>
          </div>
          <div className="rounded-2xl bg-[#141317]/70 border border-white/5 p-3">
            <div className="text-sm font-medium mb-2">Dati</div>
            <div className="flex gap-2">
              <button onClick={onExport} className="flex-1 py-2 rounded-2xl bg-white/5 border border-white/5 text-sm">Esporta JSON</button>
              <label className="flex-1 py-2 rounded-2xl bg-white/5 border border-white/5 text-sm text-center cursor-pointer">
                Importa JSON
                <input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          <div className="rounded-2xl bg-[#141317]/70 border border-white/5 p-3 text-[11px] text-zinc-400">
            L'ordine dei gruppi, l'ordine degli episodi e gli episodi eliminati con lo swipe sono strati personalizzati: la sincronizzazione non li modifica mai. Aggiunge solo le nuove stagioni, film e OVA in coda e arricchisce titoli e immagini degli episodi.
          </div>
        </div>
      </div>
    </div>
  );
}

async function exportData() {
  const data = { app: "Framory", version: 1, franchises: await db.franchises.toArray(), entries: await db.entries.toArray() };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `framory-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
async function importData(file) {
  try {
    const obj = JSON.parse(await file.text());
    if (obj.app !== "Framory") throw new Error("bad");
    if (obj.franchises) for (const f of obj.franchises) await db.franchises.put(f);
    if (obj.entries) for (const e of obj.entries) await db.entries.put(e);
    location.reload();
  } catch { alert("Backup non valido"); }
}
