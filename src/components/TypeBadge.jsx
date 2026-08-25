import React from "react";
import { Tv, Film, Sparkles } from "lucide-react";

export const CONTENT_TYPES = [
  { value: "ALL", label: "All" },
  { value: "ANIME", label: "Anime" },
  { value: "TV_SERIES", label: "Serie TV" },
  { value: "FILM", label: "Film" },
];

export const TYPE_META = {
  ANIME: { label: "Anime", icon: Sparkles, className: "bg-fuchsia-500/15 text-fuchsia-300" },
  TV_SERIES: { label: "Serie TV", icon: Tv, className: "bg-sky-500/15 text-sky-300" },
  FILM: { label: "Film", icon: Film, className: "bg-amber-500/15 text-amber-300" },
};

export function TypeBadge({ type, size = "sm", withIcon = true }) {
  const meta = TYPE_META[type] || TYPE_META.TV_SERIES;
  const Icon = meta.icon;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${meta.className} ${pad}`}>
      {withIcon && <Icon className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />}
      {meta.label}
    </span>
  );
}