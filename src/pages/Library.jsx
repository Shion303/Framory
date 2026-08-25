import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search as SearchIcon, SlidersHorizontal, Library as LibraryIcon } from "lucide-react";
import Layout from "@/components/Layout";
import { Poster } from "@/components/Poster";
import { ProgressBar, Loading, ErrorState, EmptyState } from "@/components/States";
import { TypeBadge, CONTENT_TYPES } from "@/components/TypeBadge";
import { useLibraryData } from "@/lib/useFramoryData";
import { base44 } from "@/api/base44Client";

const STATUSES = [
  { value: "all", label: "All" },
  { value: "planning", label: "Planning" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "dropped", label: "Dropped" },
];

const STATUS_STYLES = {
  planning: "bg-blue-500/15 text-blue-300",
  watching: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-amber-500/15 text-amber-300",
  dropped: "bg-rose-500/15 text-rose-300",
};

const SORTS = [
  { value: "recent", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "progress", label: "Progress" },
];

export default function Library() {
  const { library, progressMap, loading, error, reload } = useLibraryData();
  const [category, setCategory] = useState("ALL");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c = { ALL: library.length, ANIME: 0, TV_SERIES: 0, FILM: 0 };
    library.forEach((i) => { c[i.content_type || "TV_SERIES"] = (c[i.content_type || "TV_SERIES"] || 0) + 1; });
    return c;
  }, [library]);

  const items = useMemo(() => {
    let list = [...library];
    if (category !== "ALL") list = list.filter((i) => (i.content_type || "TV_SERIES") === category);
    if (filter !== "all") list = list.filter((i) => i.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) => i.title?.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sort === "title") return (a.title || "").localeCompare(b.title || "");
      if (sort === "progress") return (progressMap[b.content_id]?.percent || 0) - (progressMap[a.content_id]?.percent || 0);
      return (b.added_date || b.created_date || "").localeCompare(a.added_date || a.created_date || "");
    });
    return list;
  }, [library, category, filter, sort, query, progressMap]);

  async function changeStatus(item, status) {
    try {
      await base44.entities.LibraryItem.update(item.id, { status });
      reload();
    } catch (e) {}
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 pt-6 sm:pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Library</h1>
        <p className="text-sm text-muted-foreground mb-5">{library.length} titles tracked</p>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setCategory(t.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                category === t.value ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}{t.value !== "ALL" && ` · ${counts[t.value] || 0}`}
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter your library…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>
          <div className="relative">
            <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="appearance-none pl-9 pr-8 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            >
              {SORTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-6">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                filter === s.value ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading label="Loading library…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          title={category === "ALL" ? "Library is empty" : `No ${CONTENT_TYPES.find((t) => t.value === category)?.label} yet`}
          description="Add titles from Discovery or create them manually in Settings."
          icon={LibraryIcon}
          action={<Link to="/discovery" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Go to Discovery</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 px-4 sm:px-6">
          {items.map((item) => {
            const cp = progressMap[item.content_id] || { percent: 0, watched: 0, total: 0 };
            return (
              <div key={item.id} className="group rounded-2xl border border-border bg-card overflow-hidden hover:ring-1 hover:ring-primary/60 transition">
                <Link to={`/content/${item.content_id}`}>
                  <div className="relative">
                    <Poster src={item.poster_url} alt={item.title} className="rounded-none" />
                    <div className="absolute top-2 left-2"><TypeBadge type={item.content_type || "TV_SERIES"} size="xs" /></div>
                  </div>
                </Link>
                <div className="p-3">
                  <Link to={`/content/${item.content_id}`}>
                    <h3 className="text-sm font-semibold truncate group-hover:text-primary transition">{item.title}</h3>
                  </Link>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                    <span>{cp.watched}/{cp.total} eps</span>
                    <span className="text-primary font-semibold">{cp.percent}%</span>
                  </div>
                  <ProgressBar percent={cp.percent} className="mt-1.5 mb-2.5" />
                  <select
                    value={item.status}
                    onChange={(e) => changeStatus(item, e.target.value)}
                    className={`w-full text-[11px] font-medium rounded-lg px-2 py-1.5 border-0 focus:outline-none focus:ring-1 focus:ring-primary/60 ${STATUS_STYLES[item.status]}`}
                  >
                    <option value="planning">Planning</option>
                    <option value="watching">Watching</option>
                    <option value="completed">Completed</option>
                    <option value="paused">Paused</option>
                    <option value="dropped">Dropped</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}