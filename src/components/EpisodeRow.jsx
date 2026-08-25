import React from "react";
import { Check, Calendar, Clock } from "lucide-react";

export function EpisodeRow({ episode, watched, onToggle, disabled }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition border ${
        watched
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:border-border/80"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div
        className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition ${
          watched ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border"
        }`}
      >
        {watched ? <Check className="w-4 h-4" /> : <span className="text-[11px] font-bold">{episode.episode_number}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">E{episode.episode_number}</span>
          <h4 className="text-sm font-medium truncate">{episode.title}</h4>
        </div>
        {episode.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{episode.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/70">
          {episode.airdate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {episode.airdate}
            </span>
          )}
          {episode.runtime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {episode.runtime}m
            </span>
          )}
        </div>
      </div>
    </button>
  );
}