import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Trophy as TrophyIcon, Sparkles, CheckCircle2, Flame, Clock, Layers } from "lucide-react";
import Layout from "@/components/Layout";
import { ContentCard } from "@/components/ContentCard";
import { Loading, ErrorState, ProgressBar } from "@/components/States";
import { useLibraryData, useTrophies, useFranchises } from "@/lib/useFramoryData";
import { contentProgress } from "@/lib/tracking";
import { getShowDetail } from "@/lib/tvmaze";
import { autoSyncIfNeeded } from "@/lib/sync";

function SectionHeader({ title, icon: Icon, to = undefined }) {
  return (
    <div className="flex items-center justify-between mb-3 px-4 sm:px-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-primary" />}
        {title}
      </h2>
      {to && (
        <Link to={to} className="text-xs text-muted-foreground hover:text-primary transition-colors">
          View all →
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  const { library, seasonsByContent, progressByContent, progressMap, loading, error, reload } = useLibraryData();
  const { trophies } = useTrophies();
  const { franchises, links } = useFranchises();
  const [continueDetails, setContinueDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Background auto-sync with TVmaze (runs at most every 6 hours).
  useEffect(() => {
    autoSyncIfNeeded();
  }, []);

  // For "Continue Watching" we need next-episode info; load detail for in-progress items.
  useEffect(() => {
    if (loading || library.length === 0) return;
    const inProgress = library.filter(
      (i) => i.status === "watching" || i.status === "planning" || i.status === "paused"
    );
    if (inProgress.length === 0) return;
    setLoadingDetails(true);
    Promise.all(
      inProgress.slice(0, 12).map(async (item) => {
        try {
          const detail = await getShowDetail(item.tvmaze_id);
          const seasons = seasonsByContent[item.content_id] || detail.seasons;
          const progress = progressByContent[item.content_id] || [];
          const watchedNums = new Set(progress.map((p) => `${p.season_number}-${p.episode_number}`));
          const nextEp = (detail.episodes || []).find(
            (e) => !watchedNums.has(`${e.season_number}-${e.episode_number}`)
          );
          return {
            item,
            show: detail.show,
            nextEp,
            seasons,
            progress: contentProgress(seasons, progress),
          };
        } catch (e) {
          return null;
        }
      })
    ).then((results) => {
      const map = {};
      results.filter(Boolean).forEach((r) => {
        map[r.item.content_id] = r;
      });
      setContinueDetails(map);
      setLoadingDetails(false);
    });
  }, [loading, library, seasonsByContent, progressByContent]);

  if (loading) return <Layout><Loading label="Loading your universe…" /></Layout>;
  if (error) return <Layout><ErrorState message={error} onRetry={reload} /></Layout>;

  if (library.length === 0) {
    return (
      <Layout>
        <div className="px-4 sm:px-6 pt-10">
          <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-8 sm:p-12 text-center mb-8">
            <Sparkles className="w-10 h-10 text-primary mx-auto mb-4" />
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Welcome to Framory</h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              The place where you collect, follow and complete entire TV universes. Discover your first series to begin the journey.
            </p>
            <Link to="/discovery" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
              <Flame className="w-4 h-4" /> Start Discovering
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const continueItems = Object.values(continueDetails).filter((r) => r.nextEp);
  const inProgress = library
    .filter((i) => i.status !== "completed" && i.status !== "dropped")
    .map((i) => ({ ...i, cp: progressMap[i.content_id] }))
    .sort((a, b) => (b.cp?.percent || 0) - (a.cp?.percent || 0));
  const completed = library
    .filter((i) => i.status === "completed")
    .sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || ""));
  const unlockedTrophies = trophies.filter((t) => t.is_unlocked);
  const nearTrophies = trophies.filter((t) => !t.is_unlocked).slice(0, 4);

  const libraryShows = library.slice(0, 20).map((i) => ({
    tvmaze_id: i.tvmaze_id,
    content_id: i.content_id,
    title: i.title,
    poster_url: i.poster_url,
    year: null,
    rating: 0,
    content_type: i.content_type,
  }));

  return (
    <Layout>
      <div className="px-4 sm:px-6 pt-6 sm:pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Your Universe</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {library.length} series · {unlockedTrophies.length} trophies earned
        </p>
      </div>

      {/* Continue Watching */}
      <section className="mb-8">
        <SectionHeader title="Continue Watching" icon={Play} />
        {loadingDetails ? (
          <div className="flex gap-3 overflow-hidden px-4 sm:px-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-[260px] shrink-0 h-32 rounded-xl bg-secondary animate-pulse" />
            ))}
          </div>
        ) : continueItems.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 sm:px-6">Nothing in progress yet. Mark an episode as watched to see it here.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
            {continueItems.map((r) => (
              <Link
                key={r.item.content_id}
                to={`/content/${r.item.content_id}`}
                className="group w-[260px] shrink-0 rounded-xl overflow-hidden border border-border bg-card hover:ring-1 hover:ring-primary/60 transition"
              >
                <div className="relative h-20 bg-secondary">
                  {r.show.backdrop_url && (
                    <img src={r.show.backdrop_url} alt="" className="w-full h-full object-cover opacity-70" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                  <div className="absolute bottom-2 left-3 right-3">
                    <p className="text-xs text-primary font-medium">
                      S{r.nextEp.season_number} · E{r.nextEp.episode_number}
                    </p>
                    <p className="text-sm font-semibold text-white truncate">{r.nextEp.title}</p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{r.show.title}</p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                    <span>{r.progress.watched}/{r.progress.total} eps</span>
                    <span className="text-primary font-semibold">{r.progress.percent}%</span>
                  </div>
                  <ProgressBar percent={r.progress.percent} className="mt-1.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* In Progress */}
      {inProgress.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="In Progress" icon={Clock} to="/library" />
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
            {inProgress.slice(0, 20).map((i) => (
              <ContentCard
                key={i.id}
                show={{ tvmaze_id: i.tvmaze_id, title: i.title, poster_url: i.poster_url, year: null, rating: 0, content_type: i.content_type }}
                progress={i.cp?.percent || 0}
                to={`/content/${i.content_id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* My Library selection */}
      {libraryShows.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="My Library" icon={Sparkles} to="/library" />
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
            {libraryShows.map((s) => (
              <ContentCard key={s.content_id || s.tvmaze_id} show={s} to={`/content/${s.content_id}`} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Completed */}
      {completed.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Recently Completed" icon={CheckCircle2} to="/library" />
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
            {completed.slice(0, 20).map((i) => (
              <ContentCard
                key={i.id}
                show={{ tvmaze_id: i.tvmaze_id, title: i.title, poster_url: i.poster_url, year: null, rating: 0, content_type: i.content_type }}
                progress={100}
                to={`/content/${i.content_id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Franchises */}
      {franchises.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Franchises" icon={Layers} />
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
            {franchises.map((f) => {
              const fLinks = links.filter((l) => l.franchise_id === f.id);
              const total = fLinks.length;
              return (
                <Link
                  key={f.id}
                  to={`/franchise/${f.id}`}
                  className="group w-[200px] shrink-0 rounded-2xl overflow-hidden border border-border bg-card hover:ring-1 hover:ring-primary/60 transition"
                >
                  <div className="relative h-24 bg-secondary">
                    {f.poster_url && <img src={f.poster_url} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3">
                      <p className="text-sm font-semibold truncate">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">{total} series</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Trophies */}
      <section className="mb-8 px-4 sm:px-6">
        <SectionHeader title="Trophies" icon={TrophyIcon} to="/trophies" />
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-fuchsia-500/20 flex items-center justify-center framory-glow">
              <TrophyIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{unlockedTrophies.length}<span className="text-base text-muted-foreground">/{trophies.length}</span></p>
              <p className="text-xs text-muted-foreground">Trophies unlocked</p>
            </div>
          </div>
          {nearTrophies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Close to unlock</p>
              {nearTrophies.map((t) => (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <TrophyIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto truncate">{t.condition_content_title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}