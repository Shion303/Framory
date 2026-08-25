import React, { useState } from "react";
import { Download, Upload, Trash2, Database } from "lucide-react";
import { entities, ENTITY_NAMES } from "@/lib/api";

const ENTITIES = ENTITY_NAMES;

export function DataManager() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function exportData() {
    setBusy(true);
    setMsg("");
    try {
      const data = {};
      for (const name of ENTITIES) {
        data[name] = await entities[name].list("-created_date", 5000);
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `framory-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Backup exported.");
    } catch (e) {
      setMsg("Export failed: " + (e.message || "error"));
    } finally {
      setBusy(false);
    }
  }

  async function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Import will APPEND data to your library. Continue?")) return;
    setBusy(true);
    setMsg("");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let count = 0;
      for (const name of ENTITIES) {
        const records = data[name] || [];
        if (records.length === 0) continue;
        const clean = records.map(({ id, created_date, updated_date, created_by_id, created_by, ...rest }) => rest);
        await entities[name].bulkCreate(clean);
        count += clean.length;
      }
      setMsg(`Imported ${count} records. Reload to see changes.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg("Import failed: " + (e.message || "error"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function resetAll() {
    if (!window.confirm("This will permanently delete ALL your Framory data (library, progress, trophies, franchises). Are you sure?")) return;
    if (!window.confirm("Last chance — this cannot be undone. Delete everything?")) return;
    setBusy(true);
    setMsg("");
    try {
      for (const name of ENTITIES) {
        await entities[name].deleteMany({});
      }
      setMsg("All data deleted. Reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg("Reset failed: " + (e.message || "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Database className="w-5 h-5 text-primary" /> Data
      </h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <button
          onClick={exportData}
          disabled={busy}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-border bg-card hover:ring-1 hover:ring-primary/60 transition disabled:opacity-50"
        >
          <Download className="w-6 h-6 text-primary" />
          <span className="text-sm font-medium">Export</span>
          <span className="text-[11px] text-muted-foreground text-center">Download a JSON backup of all your data.</span>
        </button>
        <label className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-border bg-card hover:ring-1 hover:ring-primary/60 transition cursor-pointer disabled:opacity-50">
          <Upload className="w-6 h-6 text-primary" />
          <span className="text-sm font-medium">Import</span>
          <span className="text-[11px] text-muted-foreground text-center">Restore from a backup file (appends).</span>
          <input type="file" accept="application/json" onChange={importData} className="hidden" disabled={busy} />
        </label>
        <button
          onClick={resetAll}
          disabled={busy}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-destructive/30 bg-card hover:ring-1 hover:ring-destructive/60 transition disabled:opacity-50"
        >
          <Trash2 className="w-6 h-6 text-destructive" />
          <span className="text-sm font-medium">Reset</span>
          <span className="text-[11px] text-muted-foreground text-center">Delete all data permanently.</span>
        </button>
      </div>
      {msg && <p className="text-sm text-muted-foreground mt-4">{msg}</p>}
    </div>
  );
}