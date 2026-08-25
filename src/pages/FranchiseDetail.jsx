import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Layers, Plus, Trash2, CheckCircle2, Trophy } from "lucide-react";
import Layout from "@/components/Layout";
import { Poster } from "@/components/Poster";
import { Loading, ErrorState, EmptyState, ProgressBar } from "@/components/States";
import { useFranchises, useLibraryData } from "@/lib/useFramoryData";
import { franchiseProgress } from "@/lib/tracking";
import { base44 } from "@/api/base44Client";

export default function FranchiseDetail() {
  const { id } = useParams();
  const { franchises, links, loading, reload } = useFranchises();
  const { seasonsByContent, progressByContent } = useLibraryData();
  const [franchise, setFranchise] = useState(null);

  useEffect(() => {
    if (franchises.length > 0) {
      setFranchise(franchises.find((f) => f.id === id) || null);
    }
  }, [franchises, id]);

  if (loading && !franchise) return <Layout><Loading label="Loading franchise…" /></Layout>;

  if (!franchise) {
    return (
      <Layout>
        <div className="px-4 sm:px-6 pt-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <EmptyState title="Franchise not found" icon={Layers} />
        </div>
      </Layout>
    );
  }

  const contentLinks = links
    .filter((l) => l.franchise_id === id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const fp = franchiseProgress(contentLinks, seasonsByContent, progressByContent);

  async function removeContent(linkId) {
    await base44.entities.FranchiseContent.delete(linkId);
    reload();
  }

  async function deleteFranchise() {
    if (!window.confirm(`Delete franchise "${franchise.name}"? This won't affect the series inside.`)) return;
    for (const l of contentLinks) await base44.entities.FranchiseContent.delete(l.id);
    await base44.entities.Franchise.delete(franchise.id);
    window.location.href = "/";
  }

  return (
    <Layout>
      <div className="relative h-44 sm:h-56 overflow-hidden">
        {franchise.poster_url && (
          <img src={franchise.poster_url} alt="" className="w-full h-full object-cover opacity-50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <Link to="/" className="absolute top-4 left-4 sm:left-6 inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="px-4 sm:px-6 -mt-16 relative">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-5 h-5 text-primary" />
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Franchise</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">{franchise.name}</h1>
        {franchise.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{franchise.description}</p>}

        {/* Progress */}
        <div className="mt-5 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Franchise progress</span>
            {fp.completed ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Completed
              </span>
            ) : (
              <span className="text-lg font-bold text-primary">{fp.percent}%</span>
            )}
          </div>
          <ProgressBar percent={fp.percent} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-2">{fp.watched} / {fp.total} episodes watched across {contentLinks.length} series</p>
        </div>

        {/* Contents */}
        <div className="mt-6 mb-10">
          <h2 className="text-lg font-semibold mb-3">Series in this franchise</h2>
          {contentLinks.length === 0 ? (
            <EmptyState title="No series yet" description="Assign series to this franchise from their detail page." icon={Plus} />
          ) : (
            <div className="space-y-3">
              {contentLinks.map((l) => {
                const seasons = seasonsByContent[l.content_id] || [];
                const prog = progressByContent[l.content_id] || [];
                const seasonNums = new Set(seasons.map((s) => s.season_number));
                const watched = prog.filter((p) => seasonNums.has(p.season_number)).length;
                const total = seasons.reduce((s, se) => s + (se.episode_count || 0), 0);
                const percent = total > 0 ? Math.round((watched / total) * 1000) / 10 : 0;
                const completed = total > 0 && watched >= total;
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                    <Link to={`/content/${l.content_id}`} className="w-12 h-16 shrink-0">
                      <Poster src={l.poster_url} alt={l.title} className="rounded-lg" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link to={`/content/${l.content_id}`} className="text-sm font-semibold hover:text-primary truncate block">
                        {l.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{watched}/{total} eps · {percent}%</p>
                      <ProgressBar percent={percent} className="mt-1.5" />
                    </div>
                    {completed && <Trophy className="w-5 h-5 text-primary framory-text-glow" />}
                    <button
                      onClick={() => removeContent(l.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={deleteFranchise}
          className="mb-10 text-sm text-destructive/80 hover:text-destructive transition"
        >
          Delete this franchise
        </button>
      </div>
    </Layout>
  );
}