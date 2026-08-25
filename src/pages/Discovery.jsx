import React, { useEffect, useState, useCallback } from "react";
import { Search as SearchIcon, X, Flame, TrendingUp, Star, Tag } from "lucide-react";
import Layout from "@/components/Layout";
import { ContentRow, ContentCard } from "@/components/ContentCard";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { CONTENT_TYPES } from "@/components/TypeBadge";
import { getShowPool, getScheduleToday, getDiscoverySections, searchShows } from "@/lib/tmdb";

export default function Discovery() {
  const [sections, setSections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pool, schedule] = await Promise.all([getShowPool(), getScheduleToday()]);
      setSections(getDiscoverySections(pool, schedule));
    } catch (e) {
      setError(e.message || "Failed to load discovery");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const results = await searchShows(q);
        setSearchResults(results);
      } catch (e) {
        setSearchError(e.message || "Search failed");
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  const isSearching = query.trim().length > 0;

  return (
    <Layout>
      <div className="px-4 sm:px-6 pt-6 sm:pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Discovery</h1>
        <p className="text-sm text-muted-foreground mb-5">Find your next obsession, powered by TMDB.</p>

        {/* Search */}
        <div className="relative mb-8">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search series by title or keyword…"
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-2">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                typeFilter === t.value ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isSearching ? (
        <div className="px-4 sm:px-6">
          <h2 className="text-lg font-semibold mb-3">Search results{searching ? "" : ` · ${searchResults?.length || 0}`}</h2>
          {searching && <Loading label="Searching TMDB…" />}
          {searchError && <ErrorState message={searchError} onRetry={() => setQuery(query)} />}
          {!searching && !searchError && searchResults?.length === 0 && (
            <EmptyState title="No results" description={`No series found for "${query}".`} icon={SearchIcon} />
          )}
          {!searching && !searchError && searchResults?.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
              {searchResults.filter((s) => typeFilter === "ALL" || s.content_type === typeFilter).map((s) => (
                <ContentCard key={s.tmdb_id} show={s} />
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <Loading label="Loading discovery…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !sections ? (
        <EmptyState title="Nothing to show" />
      ) : (
        <>
          {(() => {
            const f = (list) => typeFilter === "ALL" ? list : list.filter((s) => s.content_type === typeFilter);
            return (
              <>
                <ContentRow title="Trending Now" icon={TrendingUp} shows={f(sections.trending)} loading={false} />
                <ContentRow title="Popular" icon={Flame} shows={f(sections.popular)} loading={false} />
                <ContentRow title="Top Rated" icon={Star} shows={f(sections.topRated)} loading={false} />
                {sections.genres.map((g) => (
                  <ContentRow key={g.name} title={g.name} icon={Tag} shows={f(g.shows)} loading={false} />
                ))}
              </>
            );
          })()}
        </>
      )}
    </Layout>
  );
}