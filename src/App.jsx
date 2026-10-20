import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Bookmark, Check, CheckCheck, ChevronLeft, ChevronRight, Film, GripVertical, Home, Loader2, MoreVertical, Play, Plus, RefreshCw, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { db, searchGroupsDetailed, defaultEntry, activeItems, computeStatus, STATUS_STYLES, STATUS_KEYS, migrateStatus, providerGetMedia, buildFranchise, previewParts, optimisticFranchise, mergeFranchiseParts, loadAllEpisodes, titleKey, syncLibrary, orderedParts, partItemsMap, reorderParts, reorderPartItems, removePart, togglePartChecked, buildDoc, mergeDocs, normalizeDoc, docToStores, docSignature, bumpDeleted } from "./framory";
import { syncEnabled, pullLibrary, pushLibrary, subscribeLibrary } from "./supabase";

const DEBOUNCE_MS = 350;
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 80;
const SYNC_INTERVAL = 30 * 60 * 1000;
const SYNC_CHECK = 5 * 60 * 1000;
// Debounce dell'invio cloud: raggruppa i tap ravvicinati (spunta episodi, note, ecc.)
// in un unico upsert per evitare invii multipli continui.
const PUSH_DEBOUNCE_MS = 1500;
// Finestra di protezione: se una modifica locale è avvenuta da meno di questo tempo,
// gli eventi Realtime in ingresso vengono ignorati per non sovrascrivere l'UI.
const LOCAL_EDIT_GRACE_MS = 3000;
const PART_STATE = { finished: "Uscito", airing: "In uscita", upcoming: "Prossimamente", unknown: "Data TBA" };
const NO_TITLE = "Titolo non disponibile";

const stripTags = (s) => String(s == null ? "" : s).replace(/<[^>]*>?/gm, "").replace(/&(?:[a-z]+|#\d+);/gi, " ").replace(/\s+/g, " ").trim();

const text = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const asList = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []);

// Sanitizza le schede PRIMA di passarle allo stato React: key mai undefined,
// array sempre definiti, titolo sempre stringa. Non lancia mai eccezioni.
function sanitizeStores(franchises, entries) {
  const fm = {}, em = {};
  let migrated = false;
  for (const r of asList(franchises)) {
    if (!r || typeof r !== "object") continue;
    const id = r.id || r.fid || null;
    if (!id) continue;
    fm[id] = {
      ...r,
      id,
      title: text(r.title) || "Senza Titolo",
      cover: text(r.cover),
      parts: asList(r.parts).filter(Boolean),
    };
  }
  for (const r of asList(entries)) {
    if (!r || typeof r !== "object") continue;
    const fid = r.franchiseId || r.id || null;
    if (!fid) continue;
    const status = r.paused ? "planned" : migrateStatus(r.status);
    if (status !== (r.status ?? null)) migrated = true;
    em[fid] = {
      ...r,
      franchiseId: fid,
      status,
      notes: text(r.notes),
      checked: asList(r.checked).filter(Boolean),
      removed: asList(r.removed).filter(Boolean),
      hiddenParts: asList(r.hiddenParts).filter(Boolean),
      order: asList(r.order).filter(Boolean),
      partOrder: asList(r.partOrder).filter(Boolean),
      addedAt: Number(r.addedAt) || Date.now(),
      updatedAt: Number(r.updatedAt) || Date.now(),
    };
  }
  return { fm, em, migrated };
}

function normalizeMedia(item) {
  if (!item || typeof item !== "object") return null;
  const t = item?.title;
  const title = text(t?.english || t?.userPreferred || t?.romaji || (typeof t === "string" ? t : item?.name)).trim();
  if (!title) return null;
  return {
    id: item?.id ?? item?.mal_id ?? null,
    malId: item?.malId ?? item?.mal_id ?? null,
    alId: item?.alId ?? null,
    title,
    titles: Array.isArray(item?.titles) ? item.titles.filter(Boolean) : [title],
    cover: text(item?.cover || item?.coverImage?.large || item?.images?.jpg?.large_image_url || item?.images?.jpg?.image_url),
    banner: text(item?.banner),
    synopsis: stripTags(item?.synopsis || item?.description),
    episodes: Number.isFinite(item?.episodes) ? item.episodes : 0,
    format: text(item?.format) || "TV",
    status: text(item?.status),
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
  const first = members[0];
  return {
    key: gr.key,
    rep: rep || { title: NO_TITLE, cover: "" },
    memberIds,
    members,
    preview: (Array.isArray(gr.preview) ? gr.preview : []).filter(Boolean).map(text).slice(0, 6),
    title: rep?.title || first?.title || text(gr.title) || NO_TITLE,
    cover: rep?.cover || first?.cover || "",
    synopsis: rep?.synopsis || first?.synopsis || "",
    year: rep?.year ?? first?.year ?? null,
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
  const [addedKey, setAddedKey] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncState, setSyncState] = useState(syncEnabled ? "connecting" : "off");
  const fRef = useRef({});
  const eRef = useRef({});
  const syncRef = useRef(false);
  const searchSeq = useRef(0);
  const cacheRef = useRef(new Map());
  const abortRef = useRef(null);
  const addingRef = useRef(false);
  const genRef = useRef(new Map());
  const docTs = useRef(0);
  const deletedRef = useRef({});
  const pushTimer = useRef(null);
  const pushDirty = useRef(false);
  // Timestamp (ms) dell'ultima modifica locale dell'utente: protegge da overwrite Realtime.
  const lastLocalEdit = useRef(0);
  // Firma dell'ultimo documento inviato: riconosce gli eventi Realtime "eco" (i propri).
  const lastPushedSig = useRef("");

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const persistStores = useCallback(async (fr, en) => {
    try {
      await db.transaction("rw", db.franchises, db.entries, async () => {
        await db.franchises.clear();
        await db.entries.clear();
        const fl = Object.values(fr); if (fl.length) await db.franchises.bulkPut(fl);
        const el = Object.values(en); if (el.length) await db.entries.bulkPut(el);
      });
    } catch (e) { console.warn("[idb] persist", e); }
  }, []);

  // Upsert immediato (coalescato) dell'intera libreria sulla riga condivisa.
  const flushPush = useCallback(async () => {
    if (!syncEnabled) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = null;
    if (!pushDirty.current) return;
    pushDirty.current = false;
    // Coerenza del payload: invia SEMPRE l'intero stato corrente (mai array vuoti/parziali).
    const doc = buildDoc(fRef.current, eRef.current, deletedRef.current, Date.now());
    if (!doc || !Array.isArray(doc.franchises) || !Array.isArray(doc.entries)) {
      pushDirty.current = true;
      return;
    }
    lastPushedSig.current = docSignature(doc);
    setSyncState("syncing");
    const r = await pushLibrary(doc);
    if (r.ok) {
      docTs.current = Math.max(docTs.current, doc.updatedAt);
      setSyncState("online");
      setLastSync(Date.now());
      db.meta.put({ key: "lastSync", value: Date.now() }).catch(() => {});
    } else {
      pushDirty.current = true;
      setSyncState("error");
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (!syncEnabled) return;
    pushDirty.current = true;
    if (pushTimer.current) return;
    pushTimer.current = setTimeout(flushPush, PUSH_DEBOUNCE_MS);
  }, [flushPush]);

  // Fonde un documento remoto nel locale. Idempotente e indipendente dagli orologi
  // dei dispositivi (niente confronto su Date.now tra PC e iPhone): usa solo il
  // last-write-wins per-item. Riscrive la riga condivisa solo se lo stato unito
  // contiene qualcosa che il remoto non ha ancora (convergenza + no loop di eco).
  //
  // Protezione anti-overwrite (Realtime):
  //  - se l'evento è l'eco del nostro stesso ultimo push -> ignora;
  //  - se una modifica locale è avvenuta negli ultimi LOCAL_EDIT_GRACE_MS -> ignora,
  //    così l'UI non viene riportata indietro mentre l'utente sta toccando la scheda;
  //  - altrimenti applica il merge SOLO se il risultato differisce dal locale (il
  //    cloud porta davvero qualcosa di più recente da un altro dispositivo).
  const mergeRemote = useCallback((remoteDoc) => {
    const remote = normalizeDoc(remoteDoc);
    // Eco del proprio push (stesso contenuto): non tocca lo stato locale.
    if (lastPushedSig.current && docSignature(remote) === lastPushedSig.current) return;
    // Finestra di grazia: una modifica locale molto recente ha priorità.
    if (Date.now() - lastLocalEdit.current < LOCAL_EDIT_GRACE_MS) return;

    const local = buildDoc(fRef.current, eRef.current, deletedRef.current, 0);
    const merged = mergeDocs(local, remote);
    const mergedSig = docSignature(merged);
    const localSig = docSignature(local);
    // Niente da applicare se il merge coincide col locale (il remoto non è più recente).
    if (mergedSig === localSig) {
      docTs.current = Math.max(docTs.current, merged.updatedAt);
      return;
    }
    const mapped = docToStores(merged);
    const stores = sanitizeStores(mapped.franchises, mapped.entries);
    deletedRef.current = merged.deleted;
    docTs.current = Math.max(docTs.current, merged.updatedAt);
    fRef.current = stores.fm;
    eRef.current = stores.em;
    setFranchises({ ...stores.fm });
    setEntries({ ...stores.em });
    setLastSync(Date.now());
    persistStores(stores.fm, stores.em);
    // Il locale conteneva dati che il remoto non ha: ritenta l'upsert con l'intero payload.
    if (mergedSig !== docSignature(remote)) schedulePush();
  }, [persistStores, schedulePush]);

  const runSync = useCallback(async (auto) => {
    if (syncRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { if (!auto) showToast("Offline - nessuna sincronizzazione"); return; }
    syncRef.current = true;
    setSyncing(true);
    try {
      const settled = Object.values(fRef.current).filter((f) => f && f.id && !f.pending);
      const { changed = [] } = (await syncLibrary(settled)) || {};
      const fresh = (Array.isArray(changed) ? changed : []).filter((f) => f && f.id);
      if (fresh.length) {
        const next = { ...fRef.current };
        for (const fr of fresh) next[fr.id] = fr;
        fRef.current = next;
        setFranchises({ ...next });
        showToast(auto ? `WatchList aggiornata (${fresh.length})` : `Sincronizzato (${fresh.length})`);
        schedulePush();
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
  }, [schedulePush]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // --- 1) IndexedDB: nessuna eccezione può far crollare il render ---
      let fm = {}, em = {}, ls = null;
      let migratedLocal = false;
      try {
        const [fr, er, lsr] = await db.transaction("r", db.franchises, db.entries, db.meta, () =>
          Promise.all([db.franchises.toArray(), db.entries.toArray(), db.meta.get("lastSync")]),
        );
        const local = sanitizeStores(fr, er);
        fm = local.fm; em = local.em; ls = lsr?.value || null;
        migratedLocal = local.migrated;
      } catch (e) {
        console.error("[load] indexeddb", e);
        fm = {}; em = {};
      }
      if (cancelled) return;

      // --- 2) Cloud: se il pull fallisce si continua OFFLINE con i dati locali ---
      let needsPush = false;
      let offlineNotice = false;
      if (syncEnabled) {
        setSyncState("connecting");
        // Lettura iniziale sulla riga globale condivisa id = SYNC_ID ("global_user_watchlist").
        const pull = await pullLibrary();
        if (cancelled) return;
        if (!pull?.ok && pull?.error !== "not-configured") { offlineNotice = true; setSyncState("error"); }
        else setSyncState("online");
        const remote = pull?.ok && pull?.doc && typeof pull.doc === "object" ? pull.doc : null;
        if (remote) {
          const remoteDoc = normalizeDoc(remote);
          const merged = mergeDocs(buildDoc(fm, em, deletedRef.current, 0), remoteDoc);
          const mapped = docToStores(merged);
          const stores = sanitizeStores(mapped.franchises, mapped.entries);
          fm = stores.fm; em = stores.em;
          deletedRef.current = merged.deleted;
          docTs.current = merged.updatedAt;
          persistStores(fm, em);
          // Se lo stato locale conteneva dati non ancora sul cloud, li riscrive subito.
          needsPush = docSignature(merged) !== docSignature(remoteDoc);
        } else if (!offlineNotice) {
          needsPush = Boolean(Object.keys(fm).length || Object.keys(em).length);
        }
      }
      if (migratedLocal) { needsPush = true; persistStores(fm, em); }

      fRef.current = fm;
      eRef.current = em;
      setFranchises(fm);
      setEntries(em);
      setLastSync(ls);
      setReady(true);

      // Fallback offline non bloccante: i dati di IndexedDB restano pienamente usabili.
      if (offlineNotice) showToast("Sync cloud non disponibile — si lavora in locale");
      if (syncEnabled && needsPush) schedulePush();
      setTimeout(() => { if (!cancelled) runSync(true); }, 350);
    })();
    return () => { cancelled = true; };
  }, [runSync, persistStores, schedulePush]);

  useEffect(() => {
    if (!ready || !syncEnabled) return undefined;
    let active = true;
    let cleanup = null;
    subscribeLibrary(
      (doc) => { if (active) { setSyncState("online"); mergeRemote(doc); } },
      (status) => { if (active && status) setSyncState(status === "SUBSCRIBED" ? "online" : "connecting"); },
    ).then((fn) => { if (active) cleanup = fn; else fn(); }).catch(() => { setSyncState(syncEnabled ? "error" : "off"); });
    return () => { active = false; if (cleanup) cleanup(); };
  }, [ready, mergeRemote]);

  useEffect(() => {
    if (!ready || !syncEnabled) return undefined;
    const flush = () => { if (document.visibilityState === "hidden") flushPush(); };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [ready, flushPush]);

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
    setSearchError(false);
    if (q.length < 3) { setGroups([]); setSearching(false); return; }
    const hit = cacheRef.current.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      cacheRef.current.delete(key);
      cacheRef.current.set(key, hit);
      setGroups(hit.g);
      setSearchError(false);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const { groups: g, failed } = await searchGroupsDetailed(q, ctrl.signal);
      if (ctrl.signal.aborted || seq !== searchSeq.current) return;
      const safe = (Array.isArray(g) ? g : []).map(normalizeGroup).filter(Boolean);
      if (!failed || safe.length) {
        cacheRef.current.set(key, { g: safe, t: Date.now() });
        if (cacheRef.current.size > CACHE_MAX) cacheRef.current.delete(cacheRef.current.keys().next().value);
      }
      setGroups(safe);
      setSearchError(!!failed && safe.length === 0);
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

  const onSearchChange = useCallback((value) => {
    const v = typeof value === "string" ? value : "";
    setSearch(v);
    setSearchError(false);
    const q = v.trim();
    if (q.length < 3) { setGroups([]); setSearching(false); }
    else setSearching(true);
  }, []);

  useEffect(() => {
    const q = search.trim();
    const key = q.toLowerCase();
    abortRef.current?.abort();
    abortRef.current = null;
    setSearchError(false);
    if (q.length < 3) { setGroups([]); setSearching(false); return undefined; }
    const hit = cacheRef.current.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      setGroups(hit.g);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const t = setTimeout(() => doSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const putEntry = (fid, en) => {
    lastLocalEdit.current = Date.now();
    const next = { ...en, updatedAt: Date.now() };
    eRef.current = { ...eRef.current, [fid]: next };
    setEntries({ ...eRef.current });
    db.entries.put(next).catch((e) => console.warn("[entry] persist", e));
    schedulePush();
  };
  const patchEntry = (fid, fn) => putEntry(fid, fn(eRef.current[fid] || defaultEntry(fid)));
  const toggleCheck = (fid, itemId) => patchEntry(fid, (en) => {
    const s = new Set(en.checked || []);
    if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
    return { ...en, checked: [...s] };
  });
  const removeItem = (fid, itemId) => patchEntry(fid, (en) => ({ ...en, removed: [...new Set([...(en.removed || []), itemId])] }));
  const toggleSeason = (fid, partId) => patchEntry(fid, (en) => togglePartChecked(fRef.current[fid], en, partId));
  const setStatus = (fid, key) => patchEntry(fid, (en) => ({ ...en, status: STATUS_KEYS.includes(key) ? key : "planned" }));
  const setNotes = (fid, notes) => patchEntry(fid, (en) => ({ ...en, notes: text(notes) }));
  const reorderPart = (fid, from, to) => patchEntry(fid, (en) => reorderParts(fRef.current[fid], en, from, to));
  const reorderItem = (fid, partId, from, to) => patchEntry(fid, (en) => reorderPartItems(fRef.current[fid], en, partId, from, to));
  // Riordino dell'INTERO franchise nella WatchList (per addedAt, che è il criterio
  // con cui `list` ordina). Scambia il valore addedAt tra fid e neighborFid.
  const reorderFranchise = useCallback((fid, neighborFid) => {
    const a = eRef.current[fid], b = eRef.current[neighborFid];
    if (!a || !b) return;
    lastLocalEdit.current = Date.now();
    const now = Date.now();
    const na = { ...a, addedAt: Number(b.addedAt) || now, updatedAt: now };
    const nb = { ...b, addedAt: Number(a.addedAt) || now, updatedAt: now };
    eRef.current = { ...eRef.current, [fid]: na, [neighborFid]: nb };
    setEntries({ ...eRef.current });
    db.transaction("rw", db.entries, async () => { await db.entries.bulkPut([na, nb]); }).catch((e) => console.warn("[reorder] persist", e));
    schedulePush();
  }, [schedulePush]);

  const findExisting = useCallback((gr) => {
    if (!gr) return null;
    const k = titleKey(gr.title);
    const ids = new Set(gr.memberIds || []);
    const hit = Object.entries(fRef.current).find(([, f]) => f && (titleKey(f.title) === k || (f.memberIds || []).some((id) => ids.has(id))));
    return hit ? hit[0] : null;
  }, []);

  const deepenFranchise = useCallback(async (fid, ids, title, gen) => {
    try {
      const meds = await providerGetMedia(ids);
      if (gen !== genRef.current.get(fid) || !fRef.current[fid]) return;
      if (!meds.length) return;
      const fr = buildFranchise(meds, title, fid);
      await loadAllEpisodes(fr.parts);
      if (gen !== genRef.current.get(fid) || !fRef.current[fid]) return;
      fr.pending = false;
      fr.updatedAt = Date.now();
      fRef.current = { ...fRef.current, [fid]: fr };
      setFranchises({ ...fRef.current });
      await db.franchises.put(fr);
      schedulePush();
    } catch (e) { console.warn("[deepen]", e); }
  }, [schedulePush]);

  useEffect(() => {
    if (!ready) return;
    const pend = Object.values(fRef.current).filter((f) => f && f.pending);
    for (const f of pend) {
      const gen = (genRef.current.get(f.id) || 0) + 1;
      genRef.current.set(f.id, gen);
      deepenFranchise(f.id, f.memberIds || [], f.title, gen);
    }
  }, [ready, deepenFranchise]);


  // Smart merge: aggiunge SOLO gli elementi selezionati.
  //  - Prima aggiunta: crea la scheda con le parti selezionate.
  //  - Serie gia presente: accoda le nuove parti senza toccare stato, note,
  //    episodi spuntati, stagioni eliminate o ordine personalizzato.
  const addSelectedToWatchlist = useCallback(async (gr, selectedIds) => {
    if (!gr || addingRef.current) return;
    lastLocalEdit.current = Date.now();
    const sel = new Set((selectedIds || []).filter(Boolean));
    if (!sel.size) { showToast("Nessun elemento selezionato"); return; }
    const members = (Array.isArray(gr.members) && gr.members.length ? gr.members : [gr.rep]).filter(Boolean);
    if (!members.length) { showToast("Dati non disponibili"); return; }

    const existing = findExisting(gr);

    // --- Serie gia presente: merge incrementale, nessuna sovrascrittura ---
    if (existing) {
      const oldFr = fRef.current[existing];
      if (!oldFr) { showToast("Scheda non trovata"); return; }
      const oldEn = eRef.current[existing] || defaultEntry(existing);
      const hiddenIds = oldEn.hiddenParts || [];
      const selectedMembers = members.filter((m) => sel.has(m.id));
      addingRef.current = true;
      try {
        // Ricostruisce l'intera opera (media vecchi + nuovi) per ordine/label corretti,
        // poi ripristina i dati delle parti gia esistenti (episodi, epoche ecc.).
        // `revived` = parti selezionate che erano state eliminate (hiddenParts).
        const prevByPart = new Map((oldFr.parts || []).map((p) => [p.id, p]));
        const { franchise: nf, added, revived } = mergeFranchiseParts(oldFr, selectedMembers, hiddenIds);
        if (!nf || (!added && !revived.length)) { showToast("Nessun nuovo elemento da aggiungere"); setPreview(null); return; }

        // Riabilita le parti recuperate rimuovendole dagli override di eliminazione.
        let ne = oldEn;
        if (revived.length) {
          const revive = new Set(revived);
          ne = { ...oldEn, hiddenParts: (oldEn.hiddenParts || []).filter((id) => !revive.has(id)), updatedAt: Date.now() };
          eRef.current = { ...eRef.current, [existing]: ne };
          setEntries({ ...eRef.current });
          db.entries.put(ne).catch((e) => console.warn("[revive] persist", e));
        }

        fRef.current = { ...fRef.current, [existing]: nf };
        setFranchises({ ...fRef.current });
        setAddedKey(gr.key);
        setPreview(null);
        const parts = [added ? `${added} nuovi` : "", revived.length ? `${revived.length} recuperati` : ""].filter(Boolean).join(" e ");
        showToast(`${parts || "0"} elementi aggiunti`);
        db.franchises.put(nf).catch((e) => console.warn("[merge] persist", e));
        schedulePush();

        // Carica titoli/immagini delle sole NUOVE parti, senza toccare gli override utente.
        const freshParts = nf.parts.filter((p) => !prevByPart.has(p.id));
        if (freshParts.length) {
          const dbg = genRef.current.get(existing) || 0;
          genRef.current.set(existing, dbg + 1);
          const gen = genRef.current.get(existing);
          await loadAllEpisodes(freshParts);
          if (gen !== genRef.current.get(existing) || !fRef.current[existing]) return;
          const cur = fRef.current[existing];
          const byId = new Map(freshParts.map((p) => [p.id, p]));
          const withEps = { ...cur, parts: cur.parts.map((p) => byId.get(p.id) || p), updatedAt: Date.now() };
          fRef.current = { ...fRef.current, [existing]: withEps };
          setFranchises({ ...fRef.current });
          db.franchises.put(withEps).catch(() => {});
          schedulePush();
        }
      } catch (e) {
        console.warn("[merge]", e);
        showToast("Errore aggiunta");
      } finally {
        addingRef.current = false;
        setTimeout(() => setAddedKey((cur) => (cur === gr.key ? null : cur)), 1200);
      }
      return;
    }

    // --- Prima aggiunta: solo gli elementi selezionati ---
    const chosen = members.filter((m) => sel.has(m.id));
    if (!chosen.length) { showToast("Nessun elemento selezionato"); return; }
    const nums = chosen.map((m) => m.malId || m.alId).filter((n) => Number.isFinite(n) && n > 0);
    const fid = nums.length ? `f:${Math.min(...nums)}` : `f:${titleKey(gr.title).replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`;
    if (fRef.current[fid]) { showToast("Gia nella WatchList"); setPreview(null); return; }

    addingRef.current = true;
    try {
      const fr = optimisticFranchise(chosen, gr.title, fid);
      const en = defaultEntry(fid);
      fRef.current = { ...fRef.current, [fid]: fr };
      eRef.current = { ...eRef.current, [fid]: en };
      setFranchises({ ...fRef.current });
      setEntries({ ...eRef.current });
      setAddedKey(gr.key);
      setPreview(null);
      showToast("Aggiunto a Pianificato");

      db.transaction("rw", db.franchises, db.entries, async () => {
        await db.franchises.put(fr);
        await db.entries.put(en);
      }).catch((e) => console.warn("[add] persist", e));

      schedulePush();
      genRef.current.set(fid, (genRef.current.get(fid) || 0) + 1);
      deepenFranchise(fid, chosen.map((m) => m.id), gr.title, genRef.current.get(fid));
    } catch (e) {
      console.warn("[add]", e);
      showToast("Errore aggiunta");
    } finally {
      addingRef.current = false;
      setTimeout(() => setAddedKey((cur) => (cur === gr.key ? null : cur)), 1200);
    }
  }, [findExisting, deepenFranchise, schedulePush]);

  const removeFromWatchlist = (fid) => {
    try {
      lastLocalEdit.current = Date.now();
      genRef.current.set(fid, (genRef.current.get(fid) || 0) + 1);
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
      db.transaction("rw", db.franchises, db.entries, async () => {
        await db.franchises.delete(fid);
        await db.entries.delete(fid);
      }).catch((e) => console.warn("[remove] persist", e));
      deletedRef.current = bumpDeleted(deletedRef.current, fid);
      schedulePush();
    } catch (e) { console.warn("[remove]", e); showToast("Errore rimozione"); }
  };

  // Elimina un'intera stagione/film/OVA: aggiorna lo stato locale, IndexedDB e cloud.
  // Se era l'ultima parte rimasta, rimuove l'intera scheda dalla WatchList.
  const removeSeason = (fid, partId) => {
    try {
      const fr = fRef.current[fid];
      const en = eRef.current[fid] || defaultEntry(fid);
      const remaining = orderedParts(fr, removePart(en, partId)).length;
      if (!remaining) { removeFromWatchlist(fid); return; }
      patchEntry(fid, (cur) => removePart(cur, partId));
      showToast("Stagione rimossa");
    } catch (e) { console.warn("[removeSeason]", e); showToast("Errore rimozione"); }
  };

  const list = useMemo(
    () => Object.entries(entries).map(([fid, en]) => ({ fid, en, fr: franchises[fid] })).filter((x) => x.fr).sort((a, b) => b.en.addedAt - a.en.addedAt),
    [franchises, entries],
  );
  const previewFid = useMemo(() => findExisting(preview), [preview, franchises, findExisting]);

  // Lock dello scroll di sfondo quando una scheda/modale è aperta.
  const overlayOpen = Boolean(detailId || preview || settingsOpen);
  useEffect(() => {
    document.body.style.overflow = overlayOpen ? "hidden" : "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [overlayOpen]);

  if (!ready) return <div className="min-h-screen bg-[#07070b] text-zinc-100 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-300" /></div>;

  return (
    <div className="relative min-h-screen bg-[#07070b] text-zinc-100 overflow-x-hidden">
      <Ambient />

      {/* Large Title iOS: nessun box attorno al nome, sotto la safe area. */}
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
        <div className="flex items-baseline gap-2">
          <h1 className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">Framory</h1>
          {syncing && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => runSync(false)} disabled={syncing} aria-label="Sincronizza" className="glass p-2.5 rounded-2xl transition-all duration-300 disabled:opacity-60 active:scale-95">{syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
          <button onClick={() => setSettingsOpen(true)} aria-label="Impostazioni" className="glass p-2.5 rounded-2xl transition-all duration-300 active:scale-95"><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      <main className="pb-36 pt-4">
        <ErrorBoundary resetKey={`${tab}|${search}`} onReset={() => { setGroups([]); setSearchError(false); }}>
          {tab === "home" && <HomeTab list={list} onOpen={setDetailId} onGoDiscovery={() => setTab("discovery")} />}
          {tab === "discovery" && <DiscoveryTab search={search} setSearch={onSearchChange} groups={groups} searching={searching} error={searchError} onRetry={retrySearch} onOpen={setPreview} />}
          {tab === "watchlist" && <WatchlistTab list={list} onOpen={setDetailId} onReorder={reorderFranchise} onDelete={removeFromWatchlist} />}
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
          onSetStatus={setStatus} onSetNotes={setNotes}
          onReorderPart={reorderPart} onReorderItem={reorderItem}
          onRemoveSeason={removeSeason} onToggleSeason={toggleSeason}
          onDelete={() => removeFromWatchlist(detailId)}
        />
      )}
      {preview && (
        <DiscoveryModal
          gr={preview} exists={previewFid} existsEn={previewFid ? entries[previewFid] : null}
          existsFr={previewFid ? franchises[previewFid] : null}
          justAdded={addedKey === preview.key} onClose={() => setPreview(null)}
          onRemove={removeFromWatchlist} onSetStatus={setStatus}
          onRemoveSeason={removeSeason} onAddSelected={addSelectedToWatchlist}
          onToggleSeason={toggleSeason}
        />
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onExport={exportData} onImport={importData} lastSync={lastSync} syncState={syncState} />}

      <div className={`fixed left-1/2 z-50 -translate-x-1/2 px-4 py-2 rounded-full border border-white/15 bg-black/60 backdrop-blur-2xl text-xs shadow-xl transition-all duration-300 ${toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`} style={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }}>{toast}</div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, lastKey: props.resetKey }; }
  static getDerivedStateFromError(error) { return { error }; }
  static getDerivedStateFromProps(props, state) {
    if (state.lastKey === props.resetKey) return null;
    return { error: null, lastKey: props.resetKey };
  }
  componentDidCatch(error, info) {
    console.error("[render] Errore intercettato dall'ErrorBoundary", error, info);
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
        <p className="font-medium mb-1">Qualcosa è andato storto.</p>
        <p className="text-sm text-zinc-500 mb-4 max-w-sm">Riprova: cambiando ricerca o tab la schermata si ripristina automaticamente.</p>
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
  const watching = list.filter((x) => { const s = computeStatus(x.fr, x.en); return s.key === "watching" || s.key === "ongoing"; });
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

function SearchField({ value, onChange }) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-zinc-500" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Cerca anime (Jikan / AniList)"
        className="w-full glass rounded-2xl py-3 pl-10 pr-10 text-sm outline-none transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:bg-white/[0.08]"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-500 transition hover:text-zinc-200">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function DiscoverySkeleton() {
  return (
    <div className="mb-2.5 flex w-full gap-3 rounded-2xl glass p-2.5" aria-hidden="true">
      <div className="aspect-[2/3] w-[72px] shrink-0 animate-pulse rounded-2xl bg-white/10" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-white/10" />
        <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-white/[0.07]" />
        <div className="mt-1 h-2.5 w-full animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
    </div>
  );
}

function DiscoveryTab({ search = "", setSearch, groups = [], searching = false, error = false, onRetry, onOpen }) {
  const query = String(search || "").trim();
  const list = Array.isArray(groups) ? groups : [];

  let state = "idle";
  if (searching) state = "loading";
  else if (query.length < 3) state = "prompt";
  else if (list.length) state = "results";
  else state = error ? "error" : "empty";

  return (
    <div className="mx-auto max-w-2xl px-3 pt-4">
      <SearchField value={search} onChange={setSearch} />

      <div className="mt-4 flex flex-col gap-2.5">
        {state === "loading" && (
          <div aria-live="polite" aria-busy="true">
            <DiscoverySkeleton />
            <DiscoverySkeleton />
          </div>
        )}

        {state === "prompt" && <Empty icon={Sparkles} title="Cerca un anime" desc="Digita almeno 3 caratteri per iniziare la ricerca." />}

        {state === "empty" && (
          <Empty icon={Search} title="Nessun risultato trovato" desc="Nessun risultato trovato o servizio momentaneamente non disponibile." />
        )}

        {state === "error" && (
          <Empty
            icon={AlertTriangle}
            title="Nessun risultato trovato"
            desc="Nessun risultato trovato o servizio momentaneamente non disponibile."
            action={<button onClick={onRetry} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm transition active:scale-95">Riprova</button>}
          />
        )}

        {state === "results" && list.map((gr) => <DiscoveryCard key={gr.key} gr={gr} onOpen={onOpen} />)}
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

// Stati ufficiali ed esclusivi (nessun altro stato ammesso).
const STATUS_OPTIONS = [
  { k: "planned", label: "Pianificato" },
  { k: "watching", label: "Sto guardando" },
  { k: "completed", label: "Completata" },
  { k: "ongoing", label: "In corso" },
];

function StatusPicker({ en, current, onSetStatus, compact }) {
  const active = STATUS_KEYS.includes(current) ? current : migrateStatus(en?.status) || "planned";
  return (
    <div className={`flex gap-1.5 overflow-x-auto pb-0.5 ${compact ? "" : "-mx-1 px-1"}`}>
      {STATUS_OPTIONS.map((o) => (
        <button
          key={o.k}
          onClick={() => onSetStatus(o.k)}
          className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] whitespace-nowrap transition-all duration-300 active:scale-95 ${active === o.k ? STATUS_STYLES[o.k] || "border-violet-400 bg-violet-500 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DiscoveryModal({ gr, exists, existsEn, existsFr, justAdded, onClose, onRemove, onSetStatus, onRemoveSeason, onAddSelected, onToggleSeason }) {
  // Tutti gli elementi dall'API: quelli eliminati (hiddenParts) devono riapparire come mancanti.
  const parts = useMemo(() => previewParts(gr.members || []), [gr]);
  const total = parts.reduce((n, p) => n + (p.episodes || 0), 0);

  // Elementi EFFETTIVAMENTE presenti nella scheda: presenti nel franchise E non eliminati.
  // Un OVA/stagione eliminato (hiddenParts) NON è "presente" -> riappare come nuovo/mancante.
  const hidden = useMemo(() => new Set(existsEn?.hiddenParts || []), [existsEn]);
  const knownIds = useMemo(() => {
    const set = new Set();
    for (const p of (existsFr?.parts || [])) if (!hidden.has(p.id)) set.add(p.id);
    for (const id of (existsFr?.memberIds || [])) if (!hidden.has(id)) set.add(id);
    return set;
  }, [existsFr, hidden]);

  // Stato spunta degli episodi per stagione (solo per elementi già nella scheda).
  const checkedSet = useMemo(() => new Set(existsEn?.checked || []), [existsEn]);
  const itemMap = useMemo(() => (existsFr ? partItemsMap(existsFr, existsEn || {}) : {}), [existsFr, existsEn]);

  // Selezione iniziale smart:
  //  - non in WatchList -> tutti selezionati
  //  - gia presente      -> solo i nuovi / mancanti (inclusi i recuperati) selezionati
  const [selected, setSelected] = useState(() => new Set(parts.filter((p) => !exists || !knownIds.has(p.id)).map((p) => p.id)));
  useEffect(() => {
    setSelected(new Set(parts.filter((p) => !exists || !knownIds.has(p.id)).map((p) => p.id)));
  }, [exists, gr.key, existsFr?.updatedAt, parts, knownIds]);

  const toggle = (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedCount = parts.filter((p) => selected.has(p.id)).length;

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
            <div className="flex items-start gap-2">
              <div className="text-base font-semibold leading-snug">{gr.title}</div>
              {justAdded && (
                <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  <Check className="w-3 h-3" />Aggiunto
                </span>
              )}
            </div>
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
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Stagioni, film e OVA</div>
            {exists && <div className="text-[10px] text-zinc-500">I nuovi/mancanti sono gia selezionati</div>}
          </div>
          <div className="flex flex-col gap-1.5">
            {parts.map((p) => {
              const inCard = knownIds.has(p.id);
              const isSel = selected.has(p.id);
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded-2xl border p-2 transition-all duration-300 ${isSel ? "border-violet-400/40 bg-violet-500/10" : "border-white/10 bg-white/[0.04]"}`}>
                  <button onClick={() => toggle(p.id)} aria-label={`Seleziona ${p.title}`} className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-all duration-300 active:scale-95 ${isSel ? "bg-violet-500 border-violet-400" : "border-white/20"}`}>{isSel && <Check className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => toggle(p.id)} className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] line-clamp-1">{p.title}</div>
                    <div className="text-[10px] text-zinc-500">{p.label}{p.episodes ? ` - ${p.episodes} ep` : ""}{p.year ? ` - ${p.year}` : ""}</div>
                  </button>
                  {exists && inCard && (
                    <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">gia presente</span>
                  )}
                  <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full border ${p.finished ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10" : p.status === "airing" ? "border-sky-400/40 text-sky-300 bg-sky-400/10" : "border-white/15 text-zinc-400"}`}>{PART_STATE[p.status] || "Data TBA"}</span>
                  {exists && inCard && (() => {
                    const ids = (itemMap[p.id] || []).map((i) => i.id);
                    const allDone = ids.length > 0 && ids.every((id) => checkedSet.has(id));
                    return (
                      <button
                        onClick={() => onToggleSeason(exists, p.id)}
                        disabled={ids.length === 0}
                        aria-label={allDone ? `Deseleziona tutti gli episodi di ${p.title}` : `Spunta tutti gli episodi di ${p.title}`}
                        className="flex shrink-0 items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2 py-1.5 text-[10px] font-medium text-emerald-400 backdrop-blur-xl transition-all duration-300 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-40"
                      >
                        <CheckCheck className="w-3 h-3" />{allDone ? "Deseleziona" : "Spunta tutti"}
                      </button>
                    );
                  })()}
                  {exists && inCard && (
                    <button
                      onClick={() => onRemoveSeason(exists, p.id)}
                      aria-label={`Elimina stagione ${p.title}`}
                      className="flex shrink-0 items-center gap-1 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[10px] font-medium text-red-400 backdrop-blur-xl transition-all duration-300 hover:bg-red-500/20 active:scale-95"
                    >
                      <Trash2 className="w-3 h-3" />Elimina
                    </button>
                  )}
                </div>
              );
            })}
            {!parts.length && <div className="text-xs text-zinc-500">Nessun elemento trovato.</div>}
          </div>
          {total > 0 && <div className="text-[11px] text-zinc-500 mt-2">{total} episodi complessivi</div>}
        </div>

        {exists && existsEn && (
          <div className="px-4 mt-4">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Stato</div>
            <StatusPicker en={existsEn} current={migrateStatus(existsEn.status) || "planned"} onSetStatus={(k) => onSetStatus(exists, k)} />
          </div>
        )}

        <div className="sticky bottom-0 mt-5 bg-[#0d0d13]/85 px-4 pt-2 pb-1 backdrop-blur-2xl">
          {exists ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onAddSelected(gr, [...selected])}
                disabled={selectedCount === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 py-3 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />Aggiungi elementi selezionati{selectedCount ? ` (${selectedCount})` : ""}
              </button>
              <button onClick={() => onRemove(exists)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-red-300 transition active:scale-95">
                <Trash2 className="w-4 h-4" />Rimuovi dalla WatchList
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onAddSelected(gr, [...selected])}
                disabled={selectedCount === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 py-3 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
              >
                {justAdded ? <><Check className="w-4 h-4" />Aggiunto</> : <><Plus className="w-4 h-4" />Aggiungi a Pianificato{selectedCount && selectedCount !== parts.length ? ` (${selectedCount})` : ""}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const WATCH_SEGMENTS = [
  { k: "planned", label: "Pianificato" },
  { k: "watching", label: "Sto guardando" },
  { k: "completed", label: "Completata" },
  { k: "ongoing", label: "In corso" },
];

function SegmentControl({ value, onChange, options }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-neutral-900/80 p-1 backdrop-blur-xl">
      {options.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            onClick={() => onChange(o.k)}
            className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-medium transition-all duration-300 ease-in-out active:scale-95 ${active ? "bg-white/15 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function WatchlistTab({ list, onOpen, onReorder, onDelete }) {
  const [seg, setSeg] = useState("planned");
  const [drag, setDrag] = useState(null);
  const [menuFid, setMenuFid] = useState(null);
  const [confirmFid, setConfirmFid] = useState(null);
  if (!list.length) return <Empty icon={Bookmark} title="WatchList vuota" desc="Vai su Discovery e aggiungi il tuo primo titolo." />;
  const filtered = list.filter((x) => computeStatus(x.fr, x.en).key === seg);

  // Sposta una scheda su/giù scambiando il suo addedAt con quello del vicino.
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= filtered.length) return;
    onReorder(filtered[i].fid, filtered[j].fid);
  };

  return (
    <div className="mx-auto max-w-5xl px-3">
      <div className="sticky top-0 z-20 -mx-3 bg-[#07070b]/85 px-3 pb-2 pt-1 backdrop-blur-xl">
        <SegmentControl value={seg} onChange={setSeg} options={WATCH_SEGMENTS} />
      </div>
      {!filtered.length ? (
        <Empty icon={Search} title="Nessun titolo qui" desc="Non ci sono titoli in questa sezione." />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((x, i) => {
            const s = computeStatus(x.fr, x.en);
            const menuOpen = menuFid === x.fid;
            return (
              <div
                key={x.fid}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag !== null && drag !== i) onReorder(filtered[drag].fid, x.fid); setDrag(null); }}
                className="group relative aspect-[2/3] w-full overflow-hidden rounded-3xl glass text-left shadow-lg shadow-black/30 transition-all duration-300 active:scale-[0.98]"
              >
                <button onClick={() => onOpen(x.fid)} className="absolute inset-0 transition-all duration-300 active:scale-95">
                  <Poster src={x.fr.cover} alt={x.fr.title} rounded="rounded-none" className="absolute inset-0 w-full h-full" />
                </button>
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-black/95 via-black/55 to-transparent px-2.5 pb-2.5 pt-10">
                  <div className="line-clamp-1 text-xs font-medium">{x.fr.title}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${STATUS_STYLES[s.key]}`}>{s.label}</span>
                    <span className="text-[9px] text-zinc-400">{s.pct}%</span>
                  </div>
                </div>

                {/* Menu azioni scheda (3 pallini) */}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuFid(menuOpen ? null : x.fid); }}
                  aria-label="Azioni scheda"
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 backdrop-blur-xl transition-all duration-300 active:scale-95"
                >
                  <MoreVertical className="w-4 h-4 text-zinc-200" />
                </button>
                {menuOpen && (
                  <div className="absolute right-1.5 top-10 z-10 w-40 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-xl shadow-black/50 backdrop-blur-2xl">
                    <button onClick={() => { setMenuFid(null); move(i, -1); }} disabled={i === 0} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-all duration-300 disabled:opacity-40 active:bg-white/10">
                      <ArrowUp className="w-3.5 h-3.5" />Sposta su
                    </button>
                    <button onClick={() => { setMenuFid(null); move(i, 1); }} disabled={i === filtered.length - 1} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-all duration-300 disabled:opacity-40 active:bg-white/10">
                      <ArrowDown className="w-3.5 h-3.5" />Sposta giù
                    </button>
                    <button onClick={() => { setMenuFid(null); setConfirmFid(x.fid); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-300 transition-all duration-300 active:bg-red-500/15">
                      <Trash2 className="w-3.5 h-3.5" />Elimina franchise
                    </button>
                  </div>
                )}

                {confirmFid === x.fid && (
                  <div className="absolute inset-0 z-20 flex flex-col justify-end gap-2 rounded-3xl bg-slate-950/90 p-3 backdrop-blur-2xl">
                    <div className="text-[11px] leading-snug text-red-200">Eliminare «{x.fr.title}» dalla WatchList?</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setConfirmFid(null)} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-1.5 text-[11px] transition-all duration-300 active:scale-95">Annulla</button>
                      <button onClick={() => { setConfirmFid(null); onDelete(x.fid); }} className="flex-1 rounded-xl bg-red-500 py-1.5 text-[11px] font-medium text-white transition-all duration-300 active:scale-95">Elimina</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ fr, en, fid, onClose, onCheck, onRemoveItem, onSetStatus, onSetNotes, onReorderPart, onReorderItem, onRemoveSeason, onToggleSeason, onDelete }) {
  const [openId, setOpenId] = useState(() => (fr.parts || [])[0]?.id ?? null);
  const [drag, setDrag] = useState(null);
  const [touch, setTouch] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [notes, setNotesLocal] = useState(() => text(en.notes));
  const parts = useMemo(() => orderedParts(fr, en), [fr, en]);
  const map = useMemo(() => partItemsMap(fr, en), [fr, en]);
  const checkedSet = useMemo(() => new Set(en.checked || []), [en.checked]);
  const s = computeStatus(fr, en);

  useEffect(() => {
    const first = (fr.parts || [])[0]?.id ?? null;
    setOpenId((cur) => (cur && (fr.parts || []).some((p) => p.id === cur) ? cur : first));
  }, [fr.id, fr.parts]);

  // Carica le note dal cloud/altri device solo se l'utente non sta scrivendo.
  const notesDirty = useRef(false);
  useEffect(() => { if (!notesDirty.current) setNotesLocal(text(en.notes)); }, [en.notes]);

  const commitNotes = useCallback(() => {
    notesDirty.current = false;
    onSetNotes(fid, notes);
  }, [onSetNotes, fid, notes]);

  const onTouchStart = (e) => { const t = e.touches[0]; setTouch({ x: t.clientX, y: t.clientY }); };
  const onTouchEnd = (e, id) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touch.y);
    if (dx < -60 && dy < 40) onRemoveItem(fid, id);
    setTouch(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 backdrop-blur-2xl">
      <div className="min-h-full pb-24">
        <div className="relative h-44">
          <Poster src={fr.banner || fr.cover} alt={fr.title} rounded="rounded-none" className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />
          <button onClick={onClose} aria-label="Torna alla WatchList" style={{ top: "calc(env(safe-area-inset-top) + 10px)" }} className="absolute left-3 flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium backdrop-blur-xl transition-all duration-300 active:scale-95">
            <ChevronLeft className="w-4 h-4" />Torna alla WatchList
          </button>
          <button onClick={() => setConfirmDel(true)} aria-label="Elimina franchise" style={{ top: "calc(env(safe-area-inset-top) + 10px)" }} className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl transition-all duration-300 active:scale-95">
            <Trash2 className="w-4 h-4 text-red-300" />
          </button>
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
          <StatusPicker en={en} current={s.key} onSetStatus={(k) => onSetStatus(fid, k)} compact />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.key]}`}>{s.label}</span>
            {s.manual && <span className="text-[10px] text-zinc-500">impostato manualmente</span>}
          </div>
        </div>

        <div className="px-3 mt-5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Note</div>
          <textarea
            value={notes}
            onChange={(e) => { notesDirty.current = true; setNotesLocal(e.target.value); }}
            onBlur={commitNotes}
            rows={3}
            placeholder="Appunti personali: dove sei arrivato, ordine di visione, giudizio…"
            className="w-full resize-y rounded-2xl border border-white/10 bg-neutral-900/80 p-3 text-[13px] leading-relaxed outline-none backdrop-blur-xl transition-all duration-300 placeholder:text-zinc-600 focus:border-violet-400/40"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">Salvate automaticamente</span>
            <button onClick={commitNotes} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] transition-all duration-300 active:scale-95">Salva nota</button>
          </div>
        </div>

        <div className="px-3 mt-5">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-sm font-medium">Stagioni, film e OVA</div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              {fr.pending && <span className="flex items-center gap-1 text-violet-300"><Loader2 className="w-3 h-3 animate-spin" />Caricamento episodi</span>}
              <span>{parts.length} gruppi</span>
            </div>
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
                    <button onClick={() => setOpenId(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex-1 flex items-center gap-3 p-2 text-left transition-all duration-300 active:bg-white/[0.03]">
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
                    {(() => {
                      const allDone = items.length > 0 && done === items.length;
                      return (
                        <button
                          onClick={() => onToggleSeason(fid, p.id)}
                          aria-label={allDone ? `Deseleziona tutti gli episodi di ${p.label}` : `Spunta tutti gli episodi di ${p.label}`}
                          className="flex shrink-0 items-center gap-1 self-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-2 text-[11px] font-medium text-emerald-400 backdrop-blur-xl transition-all duration-300 hover:bg-emerald-500/20 active:scale-95"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />{allDone ? "Deseleziona" : "Spunta tutti"}
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => onRemoveSeason(fid, p.id)}
                      aria-label={`Elimina stagione ${p.label}`}
                      className="flex shrink-0 items-center gap-1 self-center rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[11px] font-medium text-red-400 backdrop-blur-xl transition-all duration-300 hover:bg-red-500/20 active:scale-95 mr-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Elimina stagione
                    </button>
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
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 backdrop-blur-xl">
              <div className="text-sm text-red-200 mb-2">Rimuovere definitivamente tutta l'opera e i dati locali dalla WatchList?</div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2 text-sm transition-all duration-300 active:scale-95">Annulla</button>
                <button onClick={onDelete} className="flex-1 rounded-2xl bg-red-500 py-2 text-sm font-medium text-white transition-all duration-300 active:scale-95">Rimuovi</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm text-red-300 transition-all duration-300 active:scale-95">
              <Trash2 className="w-4 h-4" />Rimuovi dalla WatchList
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const SYNC_LABEL = {
  off: { t: "Solo locale", c: "text-zinc-400", d: "bg-zinc-500" },
  connecting: { t: "Connessione…", c: "text-amber-300", d: "bg-amber-400" },
  syncing: { t: "Salvataggio…", c: "text-amber-300", d: "bg-amber-400" },
  online: { t: "Sincronizzato", c: "text-emerald-300", d: "bg-emerald-400" },
  error: { t: "Errore di sincronizzazione", c: "text-red-300", d: "bg-red-400" },
};

function SettingsSheet({ onClose, onExport, onImport, lastSync, syncState = "off" }) {
  const s = SYNC_LABEL[syncState] || SYNC_LABEL.off;
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
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Sincronizzazione cloud</div>
                <div className={`flex items-center gap-1.5 text-[11px] ${s.c}`}><span className={`h-1.5 w-1.5 rounded-full ${s.d}`} />{s.t}</div>
              </div>
              <div className="text-[11px] text-zinc-400 mt-2">Ultimo aggiornamento: {lastSync ? new Date(lastSync).toLocaleString() : "Mai"}</div>
              <div className="text-[11px] text-zinc-500 mt-1">La WatchList si allinea automaticamente tra PC e iPhone in tempo reale usando un id libreria globale condiviso. Nessun codice da inserire.</div>
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
              L'ordine dei gruppi, l'ordine degli episodi e gli episodi eliminati con lo swipe sono strati personalizzati: la sincronizzazione del catalogo non li modifica mai. Aggiunge solo le nuove stagioni, film e OVA in coda e arricchisce titoli e immagini degli episodi.
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
    const now = Date.now();
    if (obj.franchises) for (const f of obj.franchises) await db.franchises.put({ ...f, updatedAt: now });
    if (obj.entries) for (const e of obj.entries) await db.entries.put({ ...e, updatedAt: now });
    location.reload();
  } catch { alert("Backup non valido"); }
}
