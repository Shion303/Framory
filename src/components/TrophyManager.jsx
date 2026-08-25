import React, { useState, useEffect } from "react";
import { Trophy as TrophyIcon, Upload, Pencil, Trash2, X, ImagePlus, Save } from "lucide-react";
import { useTrophies, useLibraryData } from "@/lib/useFramoryData";
import { base44 } from "@/api/base44Client";
import { Loading, EmptyState } from "@/components/States";
import { TrophyBadge } from "@/components/TrophyBadge";

export function TrophyManager() {
  const { trophies, loading, reload } = useTrophies();
  const { library } = useLibraryData();
  const [editing, setEditing] = useState(null); // trophy id or "new" or null
  const [form, setForm] = useState({ name: "", image_url: "", condition_content_id: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing("new");
    setForm({ name: "", image_url: "", condition_content_id: "" });
  }
  function openEdit(t) {
    setEditing(t.id);
    setForm({ name: t.name, image_url: t.image_url || "", condition_content_id: t.condition_content_id || "" });
  }
  function close() {
    setEditing(null);
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, image_url: file_url }));
    } catch (err) {
      alert("Upload failed: " + (err.message || "error"));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.name.trim()) return alert("Give your trophy a name.");
    if (!form.condition_content_id) return alert("Select a series for the unlock condition.");
    setSaving(true);
    try {
      const selected = library.find((i) => i.content_id === form.condition_content_id);
      const payload = {
        name: form.name.trim(),
        image_url: form.image_url,
        condition_type: "complete_series",
        condition_content_id: form.condition_content_id,
        condition_content_title: selected?.title || "",
      };
      if (editing === "new") {
        await base44.entities.Trophy.create({ ...payload, is_unlocked: false });
      } else {
        await base44.entities.Trophy.update(editing, payload);
      }
      close();
      reload();
    } catch (err) {
      alert("Save failed: " + (err.message || "error"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this trophy?")) return;
    await base44.entities.Trophy.delete(id);
    reload();
  }

  if (loading) return <Loading label="Loading trophies…" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrophyIcon className="w-5 h-5 text-primary" /> Trophy Management
        </h2>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
          <TrophyIcon className="w-4 h-4" /> New Trophy
        </button>
      </div>

      {trophies.length === 0 ? (
        <EmptyState title="No trophies yet" description="Create a trophy tied to completing a series. It unlocks automatically when you finish it." icon={TrophyIcon} />
      ) : (
        <div className="space-y-2.5">
          {trophies.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <TrophyBadge trophy={t} size="sm" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate">{t.name}</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {t.is_unlocked ? "Unlocked · " : "Locked · "}Complete: {t.condition_content_title || "—"}
                </p>
              </div>
              <button onClick={() => openEdit(t)} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => remove(t.id)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={close}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto scrollbar-thin"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{editing === "new" ? "New Trophy" : "Edit Trophy"}</h3>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
            </div>

            {/* Image */}
            <div className="flex flex-col items-center mb-5">
              <div className="w-28 h-28 rounded-2xl overflow-hidden bg-secondary ring-1 ring-border flex items-center justify-center mb-3">
                {form.image_url ? (
                  <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <TrophyIcon className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/70 transition cursor-pointer">
                {uploading ? <Upload className="w-4 h-4 animate-pulse" /> : <ImagePlus className="w-4 h-4" />}
                {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/*" onChange={onUpload} className="hidden" disabled={uploading} />
              </label>
              <p className="text-[11px] text-muted-foreground mt-1.5">Choose from your gallery or files.</p>
            </div>

            {/* Name */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Trophy name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Master of Westeros"
                className="w-full px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </div>

            {/* Condition */}
            <div className="mb-6">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Unlock condition</label>
              <div className="px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm mb-2">
                Complete a series
              </div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select series</label>
              {library.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 rounded-xl bg-secondary border border-border">
                  Add series to your library first to choose one.
                </p>
              ) : (
                <select
                  value={form.condition_content_id}
                  onChange={(e) => setForm({ ...form, condition_content_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                >
                  <option value="">— Select a series —</option>
                  {library.map((i) => (
                    <option key={i.id} value={i.content_id}>{i.title}</option>
                  ))}
                </select>
              )}
            </div>

            <button
              onClick={save}
              disabled={saving || uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Trophy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}