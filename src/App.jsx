import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bookmark, Check, ChevronLeft, ChevronRight, Film, GripVertical, Home, Loader2, Play, Plus, RefreshCw, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { db, searchGroups, defaultEntry, activeItems, computeStatus, STATUS_STYLES, MANUAL_STATUS, providerGetMedia, buildFranchise, previewParts, loadAllEpisodes, titleKey, syncLibrary, orderedParts, partItemsMap, reorderParts, reorderPartItems } from "./framory";

const DEBOUNCE_MS = 350;
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 80;
const SYNC_INTERVAL = 30 * 60 * 1000;
const SYNC_CHECK = 5 * 60 * 1000;
const PART_STATE = { finished: "Uscito", airing: "In uscita", upcoming: "Prossimamente", unknown: "Data TBA" };
const NO_TITLE = "Titolo non disponibile";

const stripTags = (s) => String(s == null ? "" : s).replace(/<[^>]*>?/gm, "").replace(/&(?:[a-z]+|#\d+);/gi, " ").replace(/\s+/g, " ").trim();

function normalizeMedia(item) {
  if (!item || typeof item !== "object") return null;
  const title = (item?.title?.english || item?.title?.userPreferred || item?.title?.romaji || item?.title || "").trim();
  if (!title) return null;
  return {
    id: item?.id || null,
    malId: item?.malId ?? null,
    alId: item?.alId ?? null,
    title,
    titles: Array.isArray(item?.titles) ? item.titles.filter(Boolean) : [title],
    cover: item?.cover || item?.coverImage?.large || item?.images?.jpg?.image_url || "",
    banner: item?.banner || "",
    synopsis: stripTags(item?.synopsis || item?.description),
    episodes: Number.isFinite(item?.episodes) ? item.episodes : 0,
    format: item?.format || "TV",
    status: item?.status || "",
    year: item?.year ?? null,
    score: item?.score ?? null,
    members: item?.members ?? 0,
    durationMin: item?.durationMin ?? null,
    airedFrom: item?.airedFrom ?? null,
    airing: !!item?.airing,
    relations: Array.isArray(item?.relations) ? item.relations : [],
  };
}

function normalizeGroup(gr) {
  if (!gr || typeof gr !== "object" || !gr.key) return null;
  const members = (Array.isArray(gr.members) ? gr.members : []).map(normalizeMedia).filter(Boolean);
  const rep = normalizeMedia(gr.rep) || members[0] || null;
  const memberIds = (Array.isArray(gr.memberIds) ? gr.memberIds : members.map((m) => m.id)).filter(Boolean);
  if (!memberIds.length) return null;
  return {
    key: gr.key,
    rep: rep || { title: NO_TITLE, cover: "" },
    memberIds,
    members: members.length ? members : [],
    preview: (Array.isArray(gr.preview) ? gr.preview : []).filter(Boolean).slice(0, 6),
    title: rep?.title || members[0]?.title || gr.title || NO_TITLE,
    cover: rep?.cover || members[0]?.cover || "",
    synopsis: rep?.synopsis || members[0]?.synopsis || "",
    year: rep?.year ?? members[0]?.year ?? null,
  };
}

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
  const [searchError, setSearchError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const fRef = useRef({});
  const eRef = useRef({});
  const syncRef = useRef(false);
  const searchSeq = useRef(0);
  const cacheRef = useRef(new Map());
  const abortRef = useRef(null);

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
    const key = q.toLowerCase();
    abortRef.current?.abort();
    abortRef.current = null;
    if (q.length < 3) { setGroups([]); setSearching(false); return; }
    const hit = cacheRef.current.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      cacheRef.current.delete(key);
      cacheRef.current.set(key, hit);
      setGroups(hit.g);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const g = await searchGroups(q, ctrl.signal);
      if (ctrl.signal.aborted || seq !== searchSeq.current) return;
      const safe = (Array.isArray(g) ? g : []).map(normalizeGroup).filter(Boolean);
      cacheRef.current.set(key, { g: safe, t: Date.now() });
      if (cacheRef.current.size > CACHE_MAX) cacheRef.current.delete(cacheRef.current.keys().next().value);
      setGroups(safe);
      setSearchError(false);
      setSearching(false);
    } catch (e) {
      if (e?.name === "AbortError" || ctrl.signal.aborted || seq !== searchSeq.current) return;
      console.warn("[search]", e);
      setGroups([]);
      setSearchError(true);
      setSearching(false);
    }
  }, []);

  const retrySearch = useCallback(() => { cacheRef.current.delete(search.trim().toLowerCase()); doSearch(search); }, [search, doSearch]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  if (!ready) return <div className="min-h-screen bg-[#07070b] text-zinc-100 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-300" /></div>;

  return (
    <div className="relative min-h-screen bg-[#07070b] text-zinc-100 overflow-x-hidden">
      <Ambient />

      <header className="sticky top-0 z-30 px-3 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-gradient-to-b from-[#07070b] via-[#07070b]/85 to-transparent" />
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
            <Sparkles className="w-4 h-4 text-violet-300" />
            <div className="text-sm font-semibold tracking-tight">Framory</div>
            {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => runSync(false)} disabled={syncing} aria-label="Sincronizza" className="glass p-2.5 rounded-2xl disabled:opacity-60 active:scale-95 transition-transform">{syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
            <button onClick={() => setSettingsOpen(true)} aria-label="Impostazioni" className="glass p-2.5 rounded-2xl active:scale-95 transition-transform"><Settings className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="pb-36">
        <ErrorBoundary key={`${tab}-${groups.length}`} onReset={() => setGroups([])}>
          {tab === "home" && <HomeTab list={list} onOpen={setDetailId} onGoDiscovery={() => setTab("discovery")} />}
          {tab === "discovery" && <DiscoveryTab search={search} setSearch={setSearch} groups={groups} searching={searching} error={searchError} onRetry={retrySearch} onOpen={setPreview} />}
          {tab === "watchlist" && <WatchlistTab list={list} onOpen={setDetailId} />}
        </ErrorBoundary>
      </main>

      <nav className="fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
        <div className="relative flex w-full max-w-sm items-center gap-1 rounded-[26px] border border-white/15 bg-black/40 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-b from-white/10 via-white/[0.02] to-transparent" />
          <TabBtn active={tab === "home"} onClick={() => setTab("home")} icon={Home} label="Home" />
          <TabBtn active={tab === "discovery"} onClick={() => setTab("discovery")} icon={Search} label="Discovery" />
          <TabBtn active={tab === "watchlist"} onClick={() => setTab("watchlist")} icon={Bookmark} label="Watchlist" />
        </div>
      </nav>

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

      <div className={`fixed left-1/2 z-50 -translate-x-1/2 px-4 py-2 rounded-full border border-white/15 bg-black/60 backdrop-blur-2xl text-xs shadow-xl transition-all duration-300 ${toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`} style={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }}>{toast}</div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.warn("[render]", error, info?.componentStack);
    if (typeof window !== "undefined" && window.__framoryErrors) window.__framoryErrors.push({ error, info });
  }
  reset = () => { this.setState({ error: null }); this.props.onReset?.(); };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10">
          <AlertTriangle className="w-6 h-6 text-red-300" />
        </div>
        <p className="font-medium mb-1">Impossibile caricare i risultati della ricerca.</p>
        <p className="text-sm text-zinc-500 mb-4 max-w-sm">Riprova. Se il problema continua, cambia tab e torna qui.</p>
        <button onClick={this.reset} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm active:scale-95 transition">Riprova</button>
      </div>
    );
  }
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-violet-600/25 blur-[100px]" />
      <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-sky-500/15 blur-[110px]" />
      <div className="absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-[100px]" />
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[22px] py-2 transition-all duration-300 active:scale-95 ${active ? "text-white" : "text-zinc-500"}`}
    >
      <span className={`absolute inset-0 rounded-[22px] transition-all duration-300 ${active ? "bg-white/10 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" : "opacity-0"}`} />
      <Icon className={`relative w-[18px] h-[18px] transition-transform duration-300 ${active ? "scale-110" : "scale-100"}`} strokeWidth={active ? 2.4 : 2} />
      <span className={`relative text-[10px] leading-none transition-opacity duration-300 ${active ? "opacity-100 font-medium" : "opacity-70"}`}>{label}</span>
    </button>
  );
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
  return <div className="flex flex-col items-center justify-center px-6 py-20 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl glass"><Icon className="w-6 h-6 text-zinc-400" /></div><p className="font-medium mb-1">{title}</p>{desc && <p className="text-sm text-zinc-500 mb-4 max-w-sm">{desc}</p>}{action}</div>;
}

function HomeTab({ list, onOpen, onGoDiscovery }) {
  const watching = list.filter((x) => { const s = computeStatus(x.fr, x.en); return s.key === "watching" || s.key === "ongoing" || s.key === "completed"; });
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-3 pt-4">
      <section>
        <div className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-zinc-200"><Play className="w-4 h-4" />Continua a guardare</div>
        {watching.length === 0 ? (
          <Empty icon={Play} title="Nessun anime in visione" desc="Vai su Discovery per cercare un titolo." action={<button onClick={onGoDiscovery} className="rounded-2xl border border-violet-400/40 bg-violet-500/20 px-4 py-2 text-sm text-violet-200 active:scale-95 transition">Vai su Discovery</button>} />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{watching.map((x) => <Card key={x.fid} x={x} onOpen={onOpen} />)}</div>
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
    <button onClick={() => onOpen(x.fid)} className="group flex w-full gap-3 rounded-2xl glass p-2.5 text-left shadow-lg shadow-black/20 transition-all duration-300 hover:bg-white/[0.09] active:scale-[0.99]">
      <Poster src={x.fr.cover} alt={x.fr.title} className="aspect-[2/3] w-[72px] shrink-0 shadow-md shadow-black/30" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="line-clamp-1 text-sm font-medium">{x.fr.title}</div>
        <div className="mt-0.5 text-[11px] text-zinc-400">{s.done}/{s.total} · {s.pct}%</div>
        <div className={`mt-1 w-fit rounded-full border px-1.5 py-0.5 text-[10px] ${STATUS_STYLES[s.key]}`}>{s.label}</div>
        {next && <div className="mt-auto line-clamp-1 pt-1 text-[11px] text-zinc-500">Prossimo: {next.title}</div>}
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 self-center text-zinc-600 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function SkeletonRow() {
  return (
    <div className="flex gap-3 rounded-2xl glass p-2.5" aria-hidden>
      <div className="aspect-[2/3] w-[72px] shrink-0 animate-pulse rounded-2xl bg-white/[0.07]" />
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/[0.09]" />
        <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-white/[0.07]" />
        <div className="h-2.5 w-full animate-pulse rounded-full bg-white/[0.05]" />
        <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
    </div>
  );
}

function DiscoveryTab({ search, setSearch, groups, searching, error, onRetry, onOpen }) {
  const q = search.trim();
  const hasResults = groups.length > 0;
  return (
    <div className="mx-auto max-w-2xl px-3 pt-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputMode="search"
          enterKeyHint="search"
          placeholder="Cerca anime (MAL / AniList)"
          className="w-full glass rounded-2xl py-3 pl-10 pr-10 text-sm outline-none transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:bg-white/[0.08]"
        />
        {search && (
          <button onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-500 transition hover:text-zinc-200">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {searching && (
          <div aria-live="polite" aria-busy="true">
            <DiscoverySkeleton />
            <DiscoverySkeleton />
          </div>
        )}

        {!searching && error && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center" aria-live="assertive">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10">
              <AlertTriangle className="w-6 h-6 text-red-300" />
            </div>
            <p className="font-medium mb-1">Impossibile caricare i risultati della ricerca.</p>
            <p className="mb-4 max-w-sm text-sm text-zinc-500">Riprova tra qualche istante.</p>
            <button onClick={onRetry} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm transition active:scale-95">Riprova</button>
          </div>
        )}

        {!searching && !error && !hasResults && q.length >= 3 && <Empty icon={Search} title="Nessun risultato trovato" desc="Prova con un altro titolo." />}
        {!searching && !error && !hasResults && q.length < 3 && <Empty icon={Sparkles} title="Cerca un anime" desc="Digita almeno 3 caratteri per iniziare la ricerca." />}

        {!searching && !error && hasResults && groups.map((gr) => <DiscoveryCard key={gr.key} gr={gr} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function DiscoveryCard({ gr, onOpen }) {
  return (
    <button onClick={() => onOpen(gr)} className="group flex w-full gap-3 rounded-2xl glass p-2.5 text-left shadow-lg shadow-black/20 transition-all duration-300 hover:bg-white/[0.09] active:scale-[0.99]">
      <Poster src={gr.cover} alt={gr.title} className="aspect-[2/3] w-[72px] shrink-0 shadow-md shadow-black/30" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-semibold">{gr.title}</div>
        <div className="text-[10px] text-zinc-400">{gr.memberIds.length} media{gr.preview?.length ? ` · ${gr.preview.join(" / ")}` : ""}{gr.year ? ` · ${gr.year}` : ""}</div>
        <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-zinc-500">{gr.synopsis}</div>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 self-center text-zinc-600 transition-transform group-hover:translate-x-0.5" />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/15 bg-[#0d0d13]/85 pb-4 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-center rounded-t-3xl bg-transparent pt-2 pb-1 backdrop-blur-2xl">
          <div className="w-9 h-1 rounded-full bg-white/25" />
        </div>
        <button onClick={onClose} aria-label="Chiudi" className="absolute top-3 right-3 p-2 rounded-full border border-white/10 bg-white/5"><X className="w-4 h-4" /></button>

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
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2">
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

        <div className="sticky bottom-0 mt-5 bg-[#0d0d13]/85 px-4 pt-2 pb-1 backdrop-blur-2xl">
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
    <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 px-3 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {list.map((x) => {
        const s = computeStatus(x.fr, x.en);
        return (
          <button key={x.fid} onClick={() => onOpen(x.fid)} className="group relative aspect-[2/3] w-full overflow-hidden rounded-2xl glass text-left shadow-lg shadow-black/30 transition-all duration-300 active:scale-[0.98]">
            <Poster src={x.fr.cover} alt={x.fr.title} rounded="rounded-none" className="absolute inset-0 w-full h-full" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/95 via-black/55 to-transparent px-2.5 pb-2.5 pt-10">
              <div className="line-clamp-1 text-xs font-medium">{x.fr.title}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${STATUS_STYLES[s.key]}`}>{s.label}</span>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#07070b]/92 backdrop-blur-2xl">
      <div className="min-h-full pb-24">
        <div className="relative h-44">
          <Poster src={fr.banner || fr.cover} alt={fr.title} rounded="rounded-none" className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07070b] via-[#07070b]/45 to-transparent" />
          <button onClick={onClose} aria-label="Indietro" style={{ top: "calc(env(safe-area-inset-top) + 10px)" }} className="absolute left-3 rounded-2xl border border-white/15 bg-black/40 p-2.5 backdrop-blur-xl active:scale-95 transition"><ChevronLeft className="w-4 h-4" /></button>
          <div className="absolute bottom-3 left-3 right-3 flex items-end gap-3">
            <Poster src={fr.cover} alt={fr.title} className="w-16 shrink-0 aspect-[2/3] shadow-lg shadow-black/50" />
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
                <div key={p.id} className="overflow-hidden rounded-2xl glass shadow-lg shadow-black/20">
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
                            className={`flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] p-2 ${checked ? "opacity-60" : ""}`}
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#07070b]/92 backdrop-blur-2xl">
      <div className="min-h-full pb-20">
        <div className="mx-auto max-w-2xl px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
          <div className="flex items-center justify-between">
            <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2"><Settings className="w-4 h-4" /><span className="text-sm font-medium">Impostazioni</span></div>
            <button onClick={onClose} aria-label="Chiudi" className="glass rounded-2xl p-2.5 active:scale-95 transition"><X className="w-4 h-4" /></button>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-2xl glass p-3.5 shadow-lg shadow-black/20">
              <div className="text-sm font-medium mb-2">Sincronizzazione</div>
              <div className="text-[11px] text-zinc-400">Ultimo aggiornamento: {lastSync ? new Date(lastSync).toLocaleString() : "Mai"}</div>
              <div className="text-[11px] text-zinc-500 mt-1">La WatchList viene aggiornata automaticamente ogni volta che apri l'app, in secondo piano.</div>
            </div>
            <div className="rounded-2xl glass p-3.5 shadow-lg shadow-black/20">
              <div className="text-sm font-medium mb-2">Dati</div>
              <div className="flex gap-2">
                <button onClick={onExport} className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2 text-sm active:scale-95 transition">Esporta JSON</button>
                <label className="flex-1 cursor-pointer rounded-2xl border border-white/10 bg-white/5 py-2 text-center text-sm active:scale-95 transition">
                  Importa JSON
                  <input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
                </label>
              </div>
            </div>
            <div className="rounded-2xl glass p-3.5 text-[11px] leading-relaxed text-zinc-400 shadow-lg shadow-black/20">
              L'ordine dei gruppi, l'ordine degli episodi e gli episodi eliminati con lo swipe sono strati personalizzati: la sincronizzazione non li modifica mai. Aggiunge solo le nuove stagioni, film e OVA in coda e arricchisce titoli e immagini degli episodi.
            </div>
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
