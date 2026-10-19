// Sincronizzazione cloud opzionale — inizializzazione sicura.
//
// Se le variabili d'ambiente mancano l'export `supabase` resta null e NESSUNA
// funzione viene eseguita (nessun crash React, nessuna chiamata di rete).
//
// Modello: UNA sola riga JSON per tutta l'app, condivisa da PC e iPhone, così che
// entrambi i dispositivi leggano e scrivano SEMPRE lo stesso record di `watchlists`.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

function createSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "framory-device-session" },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  } catch (e) {
    console.warn("[supabase] init", e);
    return null;
  }
}

export const supabase = createSupabase();

export const syncEnabled = Boolean(supabase);

// Id GLOBALE e fisso della riga condivisa (VITE_SYNC_ID solo come override).
export const SYNC_ID =
  import.meta.env?.VITE_SYNC_ID ||
  import.meta.env?.VITE_FRAMORY_LIBRARY_ID ||
  "global_user_watchlist";

// Alias retro-compatibile.
export const LIBRARY_ID = SYNC_ID;

const TABLE = "watchlists";

// Accesso anonimo: serve solo ad ottenere una sessione che soddisfi eventuali
// policy RLS. Se l'anon-auth non è attiva si prosegue comunque.
async function ensureSession() {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return true;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) console.warn("[supabase] anon auth", error.message);
    return !error;
  } catch (e) { console.warn("[supabase] session", e); return false; }
}

// Legge la libreria più recente. Ritorna { ok, doc, error } così il chiamante
// distingue "riga assente" da "rete/credenziali non disponibili" (→ fallback locale).
export async function pullLibrary() {
  if (!supabase) return { ok: false, doc: null, error: "not-configured" };
  try {
    await ensureSession();
    const { data, error } = await supabase.from(TABLE).select("data").eq("id", SYNC_ID).maybeSingle();
    if (error) { console.error("Errore lettura Supabase:", error.message, error.details); return { ok: false, doc: null, error: error.message, details: error.details }; }
    const doc = data && typeof data === "object" ? data.data || null : null;
    return { ok: true, doc };
  } catch (e) { console.error("Errore lettura Supabase:", e); return { ok: false, doc: null, error: String(e?.message || e) }; }
}

// Upsert immediato dell'intera libreria sulla riga condivisa.
export async function pushLibrary(doc) {
  if (!supabase) return { ok: false, error: "not-configured" };
  try {
    await ensureSession();
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { id: SYNC_ID, data: doc, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) { console.error("Errore upsert Supabase:", error.message, error.details); return { ok: false, error: error.message, details: error.details }; }
    return { ok: true };
  } catch (e) { console.error("Errore upsert Supabase:", e); return { ok: false, error: String(e?.message || e) }; }
}

// Canale Realtime della riga condivisa. Ritorna il cleanup.
export async function subscribeLibrary(onDoc, onStatus) {
  if (!supabase) return () => {};
  try {
    await ensureSession();
    const channel = supabase
      .channel(`framory-${SYNC_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `id=eq.${SYNC_ID}` },
        (payload) => { const doc = payload?.new?.data; if (doc) onDoc(doc); },
      )
      .subscribe((status) => { try { onStatus?.(status); } catch {} });
    return () => { try { supabase.removeChannel(channel); } catch {} };
  } catch (e) {
    console.warn("[supabase] subscribe", e);
    try { onStatus?.("CHANNEL_ERROR"); } catch {}
    return () => {};
  }
}
