import React, { useState } from "react";
import {
  Trophy as TrophyIcon,
  Upload,
  Pencil,
  Trash2,
  X,
  ImagePlus,
  Save,
} from "lucide-react";

import { useTrophies, useLibraryData } from "@/lib/useFramoryData";
import { entities, uploadFile } from "@/lib/api";
import { Loading, EmptyState } from "@/components/States";
import { TrophyBadge } from "@/components/TrophyBadge";

export function TrophyManager() {
  const { trophies, loading, reload } = useTrophies();
  const { library } = useLibraryData();

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    image_url: "",
    condition_content_id: "",
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing("new");

    setForm({
      name: "",
      image_url: "",
      condition_content_id: "",
    });
  }

  function openEdit(trophy) {
    setEditing(trophy.id);

    setForm({
      name: trophy.name || "",
      image_url: trophy.image_url || "",
      condition_content_id:
        trophy.condition_content_id || "",
    });
  }

  function close() {
    if (saving || uploading) return;

    setEditing(null);

    setForm({
      name: "",
      image_url: "",
      condition_content_id: "",
    });
  }

  async function onUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploading(true);

    try {
      const { file_url } = await uploadFile(file);

      setForm((current) => ({
        ...current,
        image_url: file_url,
      }));
    } catch (error) {
      console.error("TROPHY IMAGE UPLOAD ERROR:", error);

      alert(
        "Upload failed: " +
          (error?.message || "Unable to upload image")
      );
    } finally {
      setUploading(false);

      event.target.value = "";
    }
  }

  async function save() {
    const name = form.name.trim();

    if (!name) {
      alert("Give your trophy a name.");
      return;
    }

    if (!form.condition_content_id) {
      alert("Select a series for the unlock condition.");
      return;
    }

    setSaving(true);

    try {
      const selected = library.find(
        (item) =>
          item.content_id === form.condition_content_id
      );

      const payload = {
        name,
        image_url: form.image_url || null,
        condition_type: "complete_series",
        condition_content_id:
          form.condition_content_id,
        condition_content_title:
          selected?.title || "",
      };

      if (editing === "new") {
        await entities.Trophy.create({
          ...payload,
          is_unlocked: false,
        });
      } else {
        await entities.Trophy.update(
          editing,
          payload
        );
      }

      setEditing(null);

      setForm({
        name: "",
        image_url: "",
        condition_content_id: "",
      });

      await reload();
    } catch (error) {
      console.error("SAVE TROPHY ERROR:", error);

      alert(
        "Save failed: " +
          (error?.message || "Unable to save trophy")
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this trophy?")) {
      return;
    }

    try {
      await entities.Trophy.delete(id);
      await reload();
    } catch (error) {
      console.error("DELETE TROPHY ERROR:", error);

      alert(
        "Delete failed: " +
          (error?.message || "Unable to delete trophy")
      );
    }
  }

  if (loading) {
    return <Loading label="Loading trophies…" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrophyIcon className="w-5 h-5 text-primary" />
          Trophy Management
        </h2>

        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
        >
          <TrophyIcon className="w-4 h-4" />
          New Trophy
        </button>
      </div>

      {trophies.length === 0 ? (
        <EmptyState
          title="No trophies yet"
          description="Create a trophy tied to completing a series. It unlocks automatically when you finish it."
          icon={TrophyIcon}
        />
      ) : (
        <div className="space-y-2.5">
          {trophies.map((trophy) => (
            <div
              key={trophy.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <TrophyBadge
                trophy={trophy}
                size="sm"
              />

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {trophy.name}
                </h3>

                <p className="text-xs text-muted-foreground truncate">
                  {trophy.is_unlocked
                    ? "Unlocked · "
                    : "Locked · "}
                  Complete:{" "}
                  {trophy.condition_content_title ||
                    "—"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openEdit(trophy)}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary transition"
                title="Edit trophy"
              >
                <Pencil className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => remove(trophy.id)}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition"
                title="Delete trophy"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={close}
        >
          <div
            onClick={(event) =>
              event.stopPropagation()
            }
            className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto scrollbar-thin"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">
                {editing === "new"
                  ? "New Trophy"
                  : "Edit Trophy"}
              </h3>

              <button
                type="button"
                onClick={close}
                disabled={saving || uploading}
                className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image */}
            <div className="flex flex-col items-center mb-5">
              <div className="w-28 h-28 rounded-2xl overflow-hidden bg-secondary ring-1 ring-border flex items-center justify-center mb-3">
                {form.image_url ? (
                  <img
                    src={form.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <TrophyIcon className="w-12 h-12 text-muted-foreground" />
                )}
              </div>

              <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/70 transition cursor-pointer">
                {uploading ? (
                  <Upload className="w-4 h-4 animate-pulse" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}

                {uploading
                  ? "Uploading…"
                  : "Upload image"}

                <input
                  type="file"
                  accept="image/*"
                  onChange={onUpload}
                  className="hidden"
                  disabled={uploading || saving}
                />
              </label>

              <p className="text-[11px] text-muted-foreground mt-1.5">
                Choose an image from your gallery or files.
              </p>
            </div>

            {/* Name */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Trophy name
              </label>

              <input
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                  })
                }
                placeholder="e.g. Master of Westeros"
                disabled={saving}
                className="w-full px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-50"
              />
            </div>

            {/* Condition */}
            <div className="mb-6">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Unlock condition
              </label>

              <div className="px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm mb-2">
                Complete a series
              </div>

              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Select series
              </label>

              {library.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 rounded-xl bg-secondary border border-border">
                  Add series to your library first to
                  choose one.
                </p>
              ) : (
                <select
                  value={form.condition_content_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      condition_content_id:
                        event.target.value,
                    })
                  }
                  disabled={saving}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-50"
                >
                  <option value="">
                    — Select a series —
                  </option>

                  {library.map((item) => (
                    <option
                      key={item.id}
                      value={item.content_id}
                    >
                      {item.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={save}
              disabled={saving || uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />

              {saving
                ? "Saving…"
                : "Save Trophy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}