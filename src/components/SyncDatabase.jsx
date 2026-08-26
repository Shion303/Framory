import React, { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Clock, History } from "lucide-react";
import { runSync, getSyncStatus } from "@/lib/sync";
import { getMergeHistory } from "@/lib/merge";

export function SyncDatabase() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [s, h] = await Promise.all([getSyncStatus(), getMergeHistory()]);
      setStatus(s);
      setHistory(h);
    } catch (e) {
      setError(e.message || "Failed to load sync status");
    }
  }
  useEffect(() => { load(); }, []);

  async function syncNow() {
    setSyncing(true);
    setResult(null);
    setError(null);
    setProgress(null);
    try {
      const res = await runSync({ onProgress: (p) => setProgress(p) });
      setResult(res);
    } catch (e) {
      setError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
      load();
    }
  }

  const lastSync = status?.last_sync ? new Date(status.last_sync) : null;
  const isFailed = status?.status === "failed";

  return (
    <div className="space-y-4">
      {/* Sync status card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><RefreshCw className={`w-4 h-4 text-primary ${syncing ? "animate-spin" : ""}`} /> Database Sync</h3>
          <button onClick={syncNow} disabled={syncing} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Last synchronization</p>
            <p className="font-medium">{lastSync ? lastSync.toLocaleString() : "Never"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            {syncing ? (
              <p className="font-medium text-primary flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Syncing…</p>
            ) : isFailed ? (
              <p className="font-medium text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Failed</p>
            ) : (
              <p className="font-medium text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Up to date</p>
            )}
          </div>
        </div>

        {progress && syncing && (
          <p className="text-xs text-muted-foreground mt-3">Processing {progress.done}/{progress.total}…</p>
        )}

        {status?.summary && !syncing && (
          <p className="text-xs text-muted-foreground mt-3">{status.summary}</p>
        )}

        {result && !syncing && (
          <div className="mt-3 rounded-xl bg-secondary p-3 text-xs space-y-1">
            <p className="text-emerald-400">✓ Updated {result.contentsUpdated} contents</p>
            <p className="text-emerald-400">✓ {result.seasonsUpdated} seasons processed</p>
            <p className="text-emerald-400">✓ {result.episodesAdded} episodes indexed</p>
            {result.errors.length > 0 && <p className="text-amber-400">⚠ {result.errors.length} errors</p>}
          </div>
        )}
        {error && <p className="text-xs text-destructive mt-3">{error}</p>}
        {isFailed && !syncing && (
          <button onClick={syncNow} className="mt-3 text-xs text-primary hover:underline">Retry sync</button>
        )}
      </div>

      {/* Merge history */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-3"><History className="w-4 h-4 text-primary" /> Merge History</h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No merges performed yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 text-xs rounded-xl bg-secondary/50 p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{h.resolved_titles?.join(" + ") || "Contents linked"}</p>
                  <p className="text-muted-foreground truncate">({h.merged_content_ids?.length || 0} contents)</p>
                </div>
                <span className="text-muted-foreground whitespace-nowrap">{h.created_date ? new Date(h.created_date).toLocaleString() : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}