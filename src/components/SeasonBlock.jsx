import React, { useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { ProgressBar } from "@/components/States";
import { EpisodeRow } from "@/components/EpisodeRow";
import { seasonProgress } from "@/lib/tracking";

export function SeasonBlock({
  season,
  episodes,
  progressRecords,
  onToggleEpisode,
  onToggleSeason,
  disabled,
}) {
  const [open, setOpen] = useState(false);

  const prog = seasonProgress(season, progressRecords);

  const seasonEpisodes = episodes.filter(
    (e) => Number(e.season_number) === Number(season.season_number)
  );

  function handleEpisodeClick(ep, watched) {
    if (disabled) return;
    onToggleEpisode(ep, watched);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex-1 min-w-0 flex items-center gap-3 text-left hover:bg-secondary/50 transition rounded-lg"
        >
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">
              {season.title || `Season ${season.season_number}`}
            </h3>

            <p className="text-xs text-muted-foreground mt-0.5">
              {prog.watched} / {prog.total} episodes · {prog.percent}%
            </p>
          </div>

          <div className="hidden sm:block w-32">
            <ProgressBar percent={prog.percent} />
          </div>
        </button>

        {!disabled && (
          <button
            type="button"
            onClick={() => onToggleSeason(!prog.completed)}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition shrink-0"
            title={prog.completed ? "Mark all unwatched" : "Mark all watched"}
          >
            {prog.completed ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {seasonEpisodes.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">
              No episodes available.
            </p>
          ) : (
            seasonEpisodes.map((ep) => {
              const watched = progressRecords.some(
                (p) =>
                  Number(p.season_number) === Number(ep.season_number) &&
                  Number(p.episode_number) === Number(ep.episode_number)
              );

              const episodeKey = `${ep.season_number}-${ep.episode_number}`;

              return (
                <EpisodeRow
                  key={ep.id || ep.tvmaze_id || episodeKey}
                  episode={ep}
                  watched={watched}
                  disabled={disabled}
                  onToggle={() =>
                    handleEpisodeClick(ep, !watched)
                  }
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}