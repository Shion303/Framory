import Dexie from "dexie";

export const ENTITY_NAMES = [
  "Content",
  "Season",
  "Episode",
  "EpisodeProgress",
  "LibraryItem",
  "Franchise",
  "FranchiseContent",
  "Trophy",
  "SyncStatus",
  "MergeHistory",
];

export const db = new Dexie("framory");

db.version(1).stores({
  Content: "id, tvmaze_id, created_date, updated_date, source",
  Season: "id, content_id, season_number, created_date",
  Episode: "id, content_id, season_number, episode_number, created_date",
  EpisodeProgress: "id, content_id, season_number, episode_number, created_date",
  LibraryItem: "id, content_id, tvmaze_id, status, created_date, updated_date",
  Franchise: "id, created_date",
  FranchiseContent: "id, franchise_id, content_id, created_date",
  Trophy: "id, condition_content_id, is_unlocked, created_date",
  SyncStatus: "id, created_date",
  MergeHistory: "id, created_date",
});
