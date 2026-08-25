import React from "react";
import { Link } from "react-router-dom";
import { Poster } from "@/components/Poster";
import { ProgressBar } from "@/components/States";
import { TypeBadge } from "@/components/TypeBadge";
import { Star } from "lucide-react";

export function ContentCard({
  show,
  progress = undefined,
  to = undefined,
}) {
  const mediaType =
    show?.content_type === "FILM"
      ? "movie"
      : "tv";

  const href =
    to ||
    `/content/${show.tmdb_id}?type=${mediaType}`;

  return (
    <Link
      to={href}
      className="group block w-[140px] sm:w-[150px] shrink-0"
    >
      <div className="relative rounded-xl overflow-hidden bg-secondary ring-1 ring-border/60 transition-all duration-300 group-hover:ring-primary/60 group-hover:shadow-[0_0_30px_-8px_hsl(265_89%_68%/0.5)]">
        <Poster
          src={show.poster_url}
          alt={show.title}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-90" />

        {show.content_type && (
          <div className="absolute top-2 left-2">
            <TypeBadge
              type={show.content_type}
              size="xs"
            />
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-white/80 mb-1">
            {show.year && (
              <span>{show.year}</span>
            )}

            {show.rating > 0 && (
              <span className="flex items-center gap-0.5 ml-auto">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {show.rating}
              </span>
            )}
          </div>

          <h3 className="text-xs font-semibold text-white leading-tight line-clamp-2">
            {show.title}
          </h3>
        </div>

        {typeof progress === "number" && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-primary framory-text-glow">
            {progress}%
          </div>
        )}
      </div>

      {typeof progress === "number" && (
        <ProgressBar
          percent={progress}
          className="mt-1.5"
        />
      )}
    </Link>
  );
}

export function ContentRow({
  title,
  shows,
  loading = false,
  error = undefined,
  onRetry = undefined,
  progressMap = undefined,
  icon: _icon = undefined,
}) {
  if (loading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 px-4 sm:px-6">
          {title}
        </h2>

        <div className="flex gap-3 overflow-hidden px-4 sm:px-6">
          {Array.from({ length: 6 }).map(
            (_, i) => (
              <div
                key={i}
                className="w-[140px] sm:w-[150px] shrink-0 aspect-[2/3] rounded-xl bg-secondary animate-pulse"
              />
            )
          )}
        </div>
      </section>
    );
  }

  if (error) return null;

  if (!shows || shows.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3 px-4 sm:px-6">
        {title}
      </h2>

      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
        {shows.map((s) => (
          <ContentCard
            key={s.tmdb_id}
            show={s}
            progress={progressMap?.[s.tmdb_id]}
          />
        ))}
      </div>
    </section>
  );
}