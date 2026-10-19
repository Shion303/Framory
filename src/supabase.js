const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const TABLE = "watchlists";

export const LIBRARY_ID = import.meta.env?.VITE_FRAMORY_LIBRARY_ID || "framory-global";
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
      .catch((e) => { console.warn("[supabase] client", e); return null; });
  }
  return _loading;
}

async function ensureSession(client) {
  try {
    const { data } = await client.auth.getSession();
    if (data?.session) return;
    await client.auth.signInAnonymously();
  } catch {}
}

export async function pullLibrary() {
  const client = await getClient();
  if (!client) return null;
  try {
    await ensureSession(client);
    const { data, error } = await client.from(TABLE).select("data").eq("id", LIBRARY_ID).maybeSingle();
    if (error) { console.warn("[supabase] pull", error.message); return null; }
    return data?.data || null;
  } catch (e) { console.warn("[supabase] pull", e); return null; }
}

export async function pushLibrary(doc) {
  const client = await getClient();
  if (!client) return { ok: false, error: "not-configured" };
  try {
    await ensureSession(client);
    const { error } = await client
      .from(TABLE)
      .upsert({ id: LIBRARY_ID, data: doc, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { console.warn("[supabase] push", error.message); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (e) { console.warn("[supabase] push", e); return { ok: false, error: String(e?.message || e) }; }
}

export async function subscribeLibrary(onDoc, onStatus) {
  const client = await getClient();
  if (!client) return () => {};
  await ensureSession(client);
  const channel = client
    .channel("framory-watchlists")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `id=eq.${LIBRARY_ID}` },
      (payload) => { const doc = payload?.new?.data; if (doc) onDoc(doc); },
    )
    .subscribe((status) => { try { onStatus?.(status); } catch {} });
  return () => { try { client.removeChannel(channel); } catch {} };
}
