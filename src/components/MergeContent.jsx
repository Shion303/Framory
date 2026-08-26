import React, { useState, useEffect, useMemo } from "react";
import { X, Search, GitMerge, ArrowRight, AlertTriangle, Check } from "lucide-react";
import { entities } from "@/lib/api";
import { mergeContents } from "@/lib/merge";
import { TypeBadge, CONTENT_TYPES, TYPE_META } from "@/components/TypeBadge";
import { Poster } from "@/components/Poster";

const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60";

function ContentPicker({ label, selected, onSelect, excludeId }) {
  const [all, setAll] = useState([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    entities.Content.list("-created_date", 1000).then((c) => { setAll(c); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = all;
    if (typeFilter !== "ALL") list = list.filter((c) => (c.content_type || "TV_SERIES") === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.title?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || String(c.tmdb_id || "") === q);
    }
    return list;
  }, [all, query, typeFilter]);

  return (
    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {selected ? (
        <div className="flex items-center gap-3">
          <div className="w-12 h-16 shrink-0"><Poster src={selected.poster_url} alt={selected.title} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{selected.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <TypeBadge type={selected.content_type} size="xs" />
              <span className="text-[10px] text-muted-foreground">{selected.source === "MANUAL" ? "Manual" : "TMDB"}</span>
            </div>
          </div>
          <button onClick={() => onSelect(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or ID…" />
          </div>
          <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            {CONTENT_TYPES.map((t) => (
              <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap ${typeFilter === t.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{t.label}</button>
            ))}
          </div>
          <div className="max-h-44 overflow-y-auto scrollbar-thin space-y-1.5">
            {loading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
            {!loading && filtered.length === 0 && <p className="text-xs text-muted-foreground p-2">No results.</p>}
            {filtered.filter((c) => c.id !== excludeId).slice(0, 30).map((c) => (
              <button key={c.id} onClick={() => onSelect(c)} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary text-left transition">
                <div className="w-8 h-11 shrink-0"><Poster src={c.poster_url} alt={c.title} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{c.title}</p>
                  <span className="text-[10px] text-muted-foreground">{TYPE_META[c.content_type || "TV_SERIES"].label} · {c.source === "MANUAL" ? "Manual" : "TMDB"}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MergeContent({ open, onClose, onDone }) {
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [keep, setKeep] = useState("source"); // source | target
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const primary = keep === "source" ? source : target;
  const secondary = keep === "source" ? target : source;
  const canMerge = source && target && source.id !== target.id;

  async function executeMerge() {
    if (!primary || !secondary) return;
    setMerging(true);
    try {
      await mergeContents(primary.id, secondary.id);
      setDone(true);
      onDone?.();
    } catch (e) {
      alert("Merge failed: " + (e.message || "error"));
    } finally {
      setMerging(false);
    }
  }

  function reset() {
    setSource(null); setTarget(null); setKeep("source"); setConfirming(false); setDone(false);
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-xl bg-card border border-border rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Link Contents</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {done ? (
            <div className="text-center py-8">
              <Check className="w-12 h-12 text-primary mx-auto mb-3" />
              <p className="text-lg font-semibold mb-1">Link complete</p>
              <p className="text-sm text-muted-foreground">Both contents are now linked in the same franchise.</p>
              <p className="text-xs text-muted-foreground mt-2">Open the franchise page to see both contents together.</p>
              <button onClick={reset} className="mt-5 px-4 py-2.5 rounded-xl bg-secondary text-sm font-medium">Link another</button>
            </div>
          ) : confirming ? (
            <div>
              <div className="flex items-start gap-2 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 mb-4">
                <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-200/90">Both contents will remain as separate records. They will be linked together in a shared franchise. No data will be moved or deleted.</p>
              </div>
              <p className="text-sm text-muted-foreground mb-3">You are about to merge:</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 rounded-xl border border-border bg-secondary/40 p-3 text-center">
                  <p className="text-sm font-semibold truncate">{source?.title}</p>
                </div>
                <span className="text-primary text-xl">+</span>
                <div className="flex-1 rounded-xl border border-border bg-secondary/40 p-3 text-center">
                  <p className="text-sm font-semibold truncate">{target?.title}</p>
                </div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 mb-4">
                <p className="text-xs text-muted-foreground">Keep as primary:</p>
                <p className="text-sm font-semibold text-primary">{primary?.title}</p>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Both contents will keep their own seasons, episodes, progress, library data and trophies. They will appear together on the franchise page.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirming(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-secondary text-sm font-medium">Cancel</button>
                <button onClick={executeMerge} disabled={merging} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{merging ? "Linking…" : "Confirm Link"}</button>
              </div>
            </div>
          ) : (
            <>
              <ContentPicker label="Source" selected={source} onSelect={setSource} excludeId={target?.id} />
              <div className="flex justify-center my-2"><ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" /></div>
              <ContentPicker label="Target" selected={target} onSelect={setTarget} excludeId={source?.id} />

              {canMerge && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Which franchise should be used?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setKeep("source")} className={`p-3 rounded-xl border text-left transition ${keep === "source" ? "border-primary bg-primary/10 ring-1 ring-primary/60" : "border-border bg-secondary"}`}>
                      <p className="text-xs text-muted-foreground">Use franchise from</p>
                      <p className="text-sm font-semibold truncate">{source.title}</p>
                    </button>
                    <button onClick={() => setKeep("target")} className={`p-3 rounded-xl border text-left transition ${keep === "target" ? "border-primary bg-primary/10 ring-1 ring-primary/60" : "border-border bg-secondary"}`}>
                      <p className="text-xs text-muted-foreground">Use franchise from</p>
                      <p className="text-sm font-semibold truncate">{target.title}</p>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <ArrowRight className="w-4 h-4 text-primary" />
                    <span><span className="text-foreground font-medium">{secondary.title}</span> will be linked to <span className="text-primary font-medium">{primary.title}</span> in a shared franchise</span>
                  </div>
                  <button onClick={() => setConfirming(true)} className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
                    <GitMerge className="w-4 h-4" /> Link Contents
                  </button>
                </div>
              )}
              {!canMerge && source && target && source.id === target.id && (
                <p className="text-xs text-amber-400 mt-3 text-center">Select two different contents to merge.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}