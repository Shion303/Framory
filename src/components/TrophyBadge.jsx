import React from "react";
import { Trophy as TrophyIcon, Lock, Calendar } from "lucide-react";

export function TrophyBadge({ trophy, size = "md" }) {
  const dim = size === "lg" ? "w-28 h-28" : size === "sm" ? "w-14 h-14" : "w-20 h-20";
  return (
    <div
      className={`relative ${dim} rounded-2xl overflow-hidden flex items-center justify-center shrink-0 ${
        trophy.is_unlocked
          ? "bg-gradient-to-br from-primary/30 to-fuchsia-500/20 ring-2 ring-primary/60 framory-glow"
          : "bg-secondary ring-1 ring-border grayscale"
      }`}
    >
      {trophy.image_url ? (
        <img src={trophy.image_url} alt={trophy.name} className="w-full h-full object-cover" />
      ) : (
        <TrophyIcon className={`w-1/2 h-1/2 ${trophy.is_unlocked ? "text-primary" : "text-muted-foreground"}`} />
      )}
      {!trophy.is_unlocked && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function TrophyCard({ trophy }) {
  return (
    <div
      className={`rounded-2xl p-4 border transition-all ${
        trophy.is_unlocked
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex gap-4">
        <TrophyBadge trophy={trophy} />
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold truncate ${trophy.is_unlocked ? "text-primary framory-text-glow" : "text-foreground"}`}>
            {trophy.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {trophy.condition_type === "complete_series" ? "Complete series" : "Condition"}:{" "}
            <span className="text-foreground/80">{trophy.condition_content_title || "—"}</span>
          </p>
          <div className="mt-2">
            {trophy.is_unlocked ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                <TrophyIcon className="w-3.5 h-3.5" /> Unlocked
                {trophy.unlocked_date && (
                  <span className="text-muted-foreground flex items-center gap-1 ml-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(trophy.unlocked_date).toLocaleDateString()}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5" /> Locked
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}