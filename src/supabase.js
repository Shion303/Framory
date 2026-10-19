// Sincronizzazione cloud opzionale (attiva solo con VITE_SUPABASE_URL + ANON_KEY).
//
// Modello: UNA sola riga JSON per tutta l'app, condivisa da PC e iPhone.
// L'id della riga è GLOBALE e fisso (default "global_user_watchlist") così ogni
// dispositivo legge/scrive sulla STESSA identica riga della tabella `watchlists`.
// Override possibile con VITE_SYNC_ID (o VITE_FRAMORY_LIBRARY_ID, legacy).
const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const TABLE = "watchlists";

export const SYNC_ID =
  import.meta.env?.VITE_SYNC_ID ||
  import.meta.env?.VITE_FRAMORY_LIBRARY_ID ||
  "global_user_watchlist";

// Alias retro-compatibile.
export const LIBRARY_ID = SYNC_ID;

export const syncEnabled = Boolean(URL && KEY);

let _client = null;
let _loading = null;

async function getClient() {
  if (!syncEnabled) return null;
  if (_client) return _client;
  if (!_loading) {
    _loading = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        _client = createClient(URL, KEY, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: "framory-device-session" },
          realtime: { params: { eventsPerSecond: 5 } },
        });
        return _client;
      })
      .catch((e) => { console.warn("[supabase] client", e); _loading = null; return null; });
  }
  return _loading;
}

// Accesso anonimo (nessun login): serve solo a ottenere una sessione che soddisfi
// eventuali policy RLS. Se il progetto non ha l'anon-auth attiva, si prosegue
// comunque (le policy permissive permettono l'accesso con la sola anon key).
async function ensureSession(client) {
  try {
    const { data } = await client.auth.getSession();
    if (data?.session) return true;
    const { error } = await client.auth.signInAnonymously();
    if (error) console.warn("[supabase] anon auth", error.message);
    return !error;
  } catch (e) { console.warn("[supabase] session", e); return false; }
}

// Legge la libreria più recente. Ritorna il documento JSON oppure null.
export async function pullLibrary() {
  const client = await getClient();
  if (!client) return null;
  try {
    await ensureSession(client);
    const { data, error } = await client.from(TABLE).select("data").eq("id", SYNC_ID).maybeSingle();
    if (error) { console.warn("[supabase] pull", error.message); return null; }
    return data?.data || null;
  } catch (e) { console.warn("[supabase] pull", e); return null; }
}

// Upsert immediato dell'intera libreria sulla riga condivisa.
export async function pushLibrary(doc) {
  const client = await getClient();
  if (!client) return { ok: false, error: "not-configured" };
  try {
    await ensureSession(client);
    const { error } = await client
      .from(TABLE)
      .upsert(
        { id: SYNC_ID, data: doc, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) { console.warn("[supabase] push", error.message); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (e) { console.warn("[supabase] push", e); return { ok: false, error: String(e?.message || e) }; }
}

// Ascolta le modifiche della riga condivisa in tempo reale.
// Ritorna una funzione di cleanup.
export async function subscribeLibrary(onDoc, onStatus) {
  const client = await getClient();
  if (!client) return () => {};
  await ensureSession(client);
  const channel = client
    .channel(`framory-${SYNC_ID}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `id=eq.${SYNC_ID}` },
      (payload) => { const doc = payload?.new?.data; if (doc) onDoc(doc); },
    )
    .subscribe((status) => { try { onStatus?.(status); } catch {} });
  return () => { try { client.removeChannel(channel); } catch {} };
}
