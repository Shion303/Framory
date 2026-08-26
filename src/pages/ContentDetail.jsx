import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Star,
  Calendar,
  Tv,
  Globe,
  Plus,
  Trash2,
  Layers,
  ArrowLeft,
  Network,
  Edit3,
} from "lucide-react";

import Layout from "@/components/Layout";
import { Poster } from "@/components/Poster";
import {
  Loading,
  ErrorState,
  EmptyState,
  ProgressBar,
} from "@/components/States";
import { SeasonBlock } from "@/components/SeasonBlock";
import { TrophyUnlockModal } from "@/components/TrophyUnlockModal";
import { TypeBadge } from "@/components/TypeBadge";
import { getShowDetail } from "@/lib/tmdb";

import {
  ensureContentPersisted,
  loadSeasonsForContent,
  loadProgressForContent,
  loadEpisodesForContent,
  setEpisodeWatched,
  setSeasonWatched,
  syncContentStatus,
  contentProgress,
  showFromContentRecord,
} from "@/lib/tracking";

import { entities } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "dropped", label: "Dropped" },
];

export function ContentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [libraryItem, setLibraryItem] = useState(null);
  const [contentId, setContentId] = useState(null);

  const [seasons, setSeasons] = useState([]);
  const [progress, setProgress] = useState([]);
  const [renderEpisodes, setRenderEpisodes] = useState([]);

  const [franchises, setFranchises] = useState([]);
  const [franchiseLinks, setFranchiseLinks] = useState([]);

  const [unlocked, setUnlocked] = useState([]);
  const [busy, setBusy] = useState(false);

  const [showFranchiseModal, setShowFranchiseModal] = useState(false);
  const [franchiseName, setFranchiseName] = useState("");

  const isManual = detail?.contentRecord?.source === "MANUAL";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let contentRecord = null;

      try {
        contentRecord = await entities.Content.get(id);
      } catch (e) {
        // If the route id is not a Content id, treat it as a TMDB id.
      }

      let show;
      let apiSeasons;
      let apiEpisodes;

      if (contentRecord && contentRecord.source === "MANUAL") {
        show = showFromContentRecord(contentRecord);
        apiSeasons = null;
        apiEpisodes = null;
      } else {
        const tmdbId = contentRecord
          ? contentRecord.tmdb_id
          : Number(id);

        const d = await getShowDetail(tmdbId);

        show = d.show;
        apiSeasons = d.seasons;
        apiEpisodes = d.episodes;
      }

      setDetail({
        show,
        seasons: apiSeasons,
        episodes: apiEpisodes,
        contentRecord,
      });

      let item = null;

      if (contentRecord) {
        const items = await entities.LibraryItem.filter({
          content_id: contentRecord.id,
        });

        item = items[0];
      } else if (show.tmdb_id) {
        const items = await entities.LibraryItem.filter({
          tmdb_id: show.tmdb_id,
        });

        item = items[0];
      }

      const [fr, links] = await Promise.all([
        entities.Franchise.list("-created_date", 200),
        entities.FranchiseContent.list("-created_date", 1000),
      ]);

      setFranchises(fr);
      setFranchiseLinks(links);

      if (item) {
        setLibraryItem(item);

        let effectiveContentId = item.content_id;

        if (show.content_type === "FILM") {
          const ensuredContentId = await ensureContentPersisted({
            show,
            seasons: apiSeasons || [],
            episodes: apiEpisodes || [],
            existingContentId: item.content_id,
          });

          effectiveContentId = ensuredContentId || item.content_id;

          if (ensuredContentId && ensuredContentId !== item.content_id) {
            const liUpdate = await entities.LibraryItem.update(item.id, {
              content_id: ensuredContentId,
            });

            if (liUpdate) {
              setLibraryItem(liUpdate);
            }
          }
        }

        setContentId(effectiveContentId);

        const [se, pr, eps] = await Promise.all([
          loadSeasonsForContent(effectiveContentId),
          loadProgressForContent(effectiveContentId),
          show.content_type === "FILM" || contentRecord?.source === "MANUAL"
            ? loadEpisodesForContent(effectiveContentId)
            : Promise.resolve(null),
        ]);

        if (show.content_type === "FILM") {
          setSeasons(
            se.filter(
              (s) => Number(s.season_number) === 1
            )
          );
          setRenderEpisodes(
            (eps || []).filter(
              (e) =>
                Number(e.season_number) === 1 &&
                Number(e.episode_number) === 1
            )
          );
        } else {
          setSeasons(se);
          if (eps !== null) {
            setRenderEpisodes(eps);
          } else {
            setRenderEpisodes(apiEpisodes || []);
          }
        }

        setProgress(pr);
      } else {
        setSeasons(apiSeasons || []);
        setRenderEpisodes(apiEpisodes || []);
      }
    } catch (e) {
      console.error("CONTENT LOAD ERROR:", e);
      setError(e?.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addToLibrary(status = "watching") {
    if (!detail) return;

    setBusy(true);
    setError(null);

    try {
      const cid = await ensureContentPersisted({
        show: detail.show,
        seasons: detail.seasons || [],
        episodes: detail.episodes || [],
      });

      const created = await entities.LibraryItem.create({
        content_id: cid,
        tmdb_id: detail.show.tmdb_id,
        title: detail.show.title,
        poster_url: detail.show.poster_url,
        status,
        added_date: new Date().toISOString(),
        content_type: detail.show.content_type || "TV_SERIES",
      });

      setLibraryItem(created);
      setContentId(cid);

      const [se, pr, eps] = await Promise.all([
        loadSeasonsForContent(cid),
        loadProgressForContent(cid),
        detail.show.content_type === "FILM"
          ? loadEpisodesForContent(cid)
          : Promise.resolve(null),
      ]);

      if (detail.show.content_type === "FILM") {
        setSeasons(
          se.filter(
            (s) => Number(s.season_number) === 1
          )
        );
        setRenderEpisodes(
          (eps || []).filter(
            (e) =>
              Number(e.season_number) === 1 &&
              Number(e.episode_number) === 1
          )
        );
      } else {
        setSeasons(se);
        setRenderEpisodes(detail.episodes || []);
      }

      setProgress(pr);
    } catch (e) {
      console.error("ADD TO LIBRARY ERROR:", e);
      setError(e?.message || "Failed to add to library");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromLibrary() {
    if (!libraryItem) return;

    setBusy(true);
    setError(null);

    try {
      await entities.LibraryItem.delete(libraryItem.id);

      setLibraryItem(null);
      setContentId(null);
      setProgress([]);
    } catch (e) {
      console.error("REMOVE FROM LIBRARY ERROR:", e);
      setError(e?.message || "Failed to remove from library");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status) {
    if (!libraryItem) return;

    try {
      const updated = await entities.LibraryItem.update(
        libraryItem.id,
        { status }
      );

      setLibraryItem(updated);
    } catch (e) {
      console.error("CHANGE STATUS ERROR:", e);
      setError(e?.message || "Failed to change status");
    }
  }

  async function toggleEpisode(ep, watched) {
    if (!contentId) {
      console.error("Cannot toggle episode: contentId is missing.");
      return;
    }

    try {
      setError(null);

      await setEpisodeWatched(
        contentId,
        ep.season_number,
        ep.episode_number,
        watched
      );

      const pr = await loadProgressForContent(contentId);
      setProgress(pr);

      try {
        const res = await syncContentStatus(contentId);

        if (res.unlocked && res.unlocked.length > 0) {
          setUnlocked(res.unlocked);
        }

        if (libraryItem) {
          const items = await entities.LibraryItem.filter({
            content_id: contentId,
          });

          if (items.length > 0) {
            setLibraryItem(items[0]);
          }
        }
      } catch (syncError) {
        console.error("SYNC CONTENT STATUS ERROR:", syncError);
      }
    } catch (e) {
      console.error("EPISODE TOGGLE ERROR:", e);

      setError(
        e?.message ||
          e?.error_description ||
          "Failed to update episode progress"
      );
    }
  }

  async function toggleSeason(season, watched) {
    if (!contentId) return;

    try {
      setError(null);

      await setSeasonWatched(
        contentId,
        season,
        renderEpisodes,
        watched
      );

      const pr = await loadProgressForContent(contentId);
      setProgress(pr);

      try {
        const res = await syncContentStatus(contentId);

        if (res.unlocked && res.unlocked.length > 0) {
          setUnlocked(res.unlocked);
        }

        if (libraryItem) {
          const items = await entities.LibraryItem.filter({
            content_id: contentId,
          });

          if (items.length > 0) {
            setLibraryItem(items[0]);
          }
        }
      } catch (syncError) {
        console.error("SYNC SEASON STATUS ERROR:", syncError);
      }
    } catch (e) {
      console.error("SEASON TOGGLE ERROR:", e);

      setError(
        e?.message ||
          e?.error_description ||
          "Failed to update season progress"
      );
    }
  }

  async function assignFranchise(franchiseId) {
    if (!contentId) return;

    try {
      const existing = franchiseLinks.filter(
        (link) => link.content_id === contentId
      );

      for (const link of existing) {
        await entities.FranchiseContent.delete(link.id);
      }

      if (franchiseId && franchiseId !== "none") {
        await entities.FranchiseContent.create({
          franchise_id: franchiseId,
          content_id: contentId,
        });
      }

      const links = await entities.FranchiseContent.list(
        "-created_date",
        1000
      );

      setFranchiseLinks(links);
    } catch (e) {
      console.error("ASSIGN FRANCHISE ERROR:", e);
      setError(e?.message || "Failed to assign franchise");
    }
  }

  async function createFranchise() {
    if (!contentId || !detail?.show) return;

    const name = franchiseName.trim();

    if (!name) return;

    try {
      setError(null);
      setBusy(true);

      const created = await entities.Franchise.create({
        name,
        description: "",
        poster_url:
          detail.show.backdrop_url || detail.show.poster_url,
      });

      await entities.FranchiseContent.create({
        franchise_id: created.id,
        content_id: contentId,
      });

      const [fr, links] = await Promise.all([
        entities.Franchise.list("-created_date", 200),
        entities.FranchiseContent.list(
          "-created_date",
          1000
        ),
      ]);

      setFranchises(fr);
      setFranchiseLinks(links);

      setFranchiseName("");
      setShowFranchiseModal(false);
    } catch (e) {
      console.error("CREATE FRANCHISE ERROR:", e);
      setError(e?.message || "Failed to create franchise");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <Loading label="Loading…" />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <ErrorState message={error} onRetry={load} />
      </Layout>
    );
  }

  if (!detail) {
    return (
      <Layout>
        <EmptyState title="Not found" />
      </Layout>
    );
  }

  const { show } = detail;
  const cp = contentProgress(seasons, progress);

  const currentFranchiseLink = franchiseLinks.find(
    (link) => link.content_id === contentId
  );

  const currentFranchise = franchises.find(
    (franchise) =>
      franchise.id === currentFranchiseLink?.franchise_id
  );

  return (
    <Layout>
      {showFranchiseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">
              Create franchise
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              Enter a name for this franchise.
            </p>

            <input
              type="text"
              value={franchiseName}
              onChange={(event) =>
                setFranchiseName(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createFranchise();
                }

                if (event.key === "Escape") {
                  setShowFranchiseModal(false);
                }
              }}
              autoFocus
              className="w-full mt-4 px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              placeholder="Franchise name"
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowFranchiseModal(false);
                  setFranchiseName("");
                }}
                className="px-4 py-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/70 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createFranchise}
                disabled={!franchiseName.trim() || busy}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <TrophyUnlockModal
        trophies={unlocked}
        onClose={() => setUnlocked([])}
      />

      <div className="relative h-52 sm:h-72 md:h-80 overflow-hidden">
        {show.backdrop_url ? (
          <img
            src={show.backdrop_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-background" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 sm:left-6 w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white hover:bg-black/70 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {isManual && (
          <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-black/60 text-[10px] font-medium text-primary flex items-center gap-1">
            <Edit3 className="w-3 h-3" />
            Manual
          </span>
        )}
      </div>

      <div className="px-4 sm:px-6 -mt-24 sm:-mt-32 relative">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="w-32 sm:w-44 shrink-0 mx-auto sm:mx-0">
            <Poster
              src={show.poster_url}
              alt={show.title}
              className="rounded-xl ring-1 ring-border shadow-2xl"
            />
          </div>

          <div className="flex-1 min-w-0 pt-2 sm:pt-16">
            <div className="flex items-center gap-2 mb-2">
              <TypeBadge type={show.content_type} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold">
              {show.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              {show.year && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {show.year}
                </span>
              )}

              {show.rating > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  {show.rating}
                </span>
              )}

              {show.network && (
                <span className="flex items-center gap-1">
                  <Network className="w-3.5 h-3.5" />
                  {show.network}
                </span>
              )}

              {show.type && (
                <span className="flex items-center gap-1">
                  <Tv className="w-3.5 h-3.5" />
                  {show.type}
                </span>
              )}

              {show.language && (
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  {show.language}
                </span>
              )}

              {show.status && (
                <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground/80">
                  {show.status}
                </span>
              )}
            </div>

            {show.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {show.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {show.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed mt-5 max-w-3xl">
            {show.summary}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          {!libraryItem ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => addToLibrary("watching")}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
                Add to Library
              </button>

              <button
                onClick={() => addToLibrary("planning")}
                disabled={busy}
                className="px-4 py-3 rounded-xl bg-secondary text-foreground font-medium hover:bg-secondary/70 transition disabled:opacity-50"
              >
                Add to Planning
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">
                    Your progress
                  </span>

                  <span className="text-sm font-semibold text-primary">
                    {cp.percent}%
                  </span>
                </div>

                <ProgressBar percent={cp.percent} />

                <p className="text-xs text-muted-foreground mt-1.5">
                  {cp.watched} / {cp.total} episodes watched
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={libraryItem.status}
                  onChange={(event) =>
                    changeStatus(event.target.value)
                  }
                  className="px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option
                      key={status.value}
                      value={status.value}
                    >
                      {status.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={removeFromLibrary}
                  disabled={busy}
                  className="p-2.5 rounded-xl bg-secondary text-muted-foreground hover:text-destructive transition"
                  title="Remove from library"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">
              Franchise
            </h2>
          </div>

          {currentFranchise ? (
            <div className="flex items-center justify-between gap-3">
              <Link
                to={"/franchise/" + currentFranchise.id}
                className="text-sm text-primary hover:underline"
              >
                {currentFranchise.name}
              </Link>

              <select
                value={currentFranchiseLink.franchise_id}
                onChange={(event) =>
                  assignFranchise(event.target.value)
                }
                className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                <option value="none">
                  Remove
                </option>

                {franchises.map((franchise) => (
                  <option
                    key={franchise.id}
                    value={franchise.id}
                  >
                    {franchise.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              {contentId ? (
                <>
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        assignFranchise(event.target.value);
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                  >
                    <option value="">
                      Assign to franchise…
                    </option>

                    {franchises.map((franchise) => (
                      <option
                        key={franchise.id}
                        value={franchise.id}
                      >
                        {franchise.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      setFranchiseName(
                        detail.show.title + " Universe"
                      );
                      setShowFranchiseModal(true);
                    }}
                    className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition"
                  >
                    + New franchise
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Add to library to assign a franchise.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 mb-10">
          <h2 className="text-lg font-semibold mb-3 px-1">
            Seasons{" "}
            {seasons.length > 0 && (
              <span className="text-muted-foreground text-sm">
                · {seasons.length}
              </span>
            )}
          </h2>

          {!libraryItem && (
            <p className="text-xs text-muted-foreground mb-3 px-1">
              Add to your library to start tracking episodes.
            </p>
          )}

          <div className="space-y-2.5">
            {seasons.map((season) => (
              <SeasonBlock
                key={season.id || season.season_number}
                season={season}
                episodes={renderEpisodes}
                progressRecords={progress}
                disabled={!libraryItem}
                onToggleEpisode={toggleEpisode}
                onToggleSeason={(watched) =>
                  toggleSeason(season, watched)
                }
              />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default ContentDetail;