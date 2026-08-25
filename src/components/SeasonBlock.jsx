import React, { useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { ProgressBar } from "@/components/States";
import { EpisodeRow } from "@/components/EpisodeRow";
import { seasonProgress } from "@/lib/tracking";

export function SeasonBlock({ season, episodes, progressRecords, onToggleEpisode, onToggleSeason, disabled }) {
  const [open, setOpen] = useState(false);
  const prog = seasonProgress(season, progressRecords);
  const seasonEpisodes = episodes.filter((e) => e.season_number === season.season_number);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/50 transition"
      >
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
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
        {!disabled && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleSeason(!prog.completed);
            }}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition"
            title={prog.completed ? "Mark all unwatched" : "Mark all watched"}
          >
            {prog.completed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {seasonEpisodes.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">No episodes available.</p>
          ) : (
            seasonEpisodes.map((ep) => {
              const watched = progressRecords.some(
                (p) => p.season_number === ep.season_number && p.episode_number === ep.episode_number
              );
              return (
                <EpisodeRow
                  key={ep.tvmaze_id}
                  episode={ep}
                  watched={watched}
                  disabled={disabled}
                  onToggle={() => onToggleEpisode(ep, !watched)}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}