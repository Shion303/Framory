export type Role = "owner" | "admin" | "moderator" | "user";
export type PrivacyLevel = "pubblico" | "follower" | "privato";
export type AnimeStatus = "annunciato" | "in_corso" | "concluso" | "in_pausa";
export type WorkFormat = "tv" | "film" | "ova" | "ona" | "special";
export type LibraryState = "pianificato" | "in_visione" | "completato" | "in_pausa" | "interrotto";
export type BadgeRarity = "comune" | "raro" | "epico" | "leggendario";
export type BadgeCategory = "tracking" | "collezione" | "community" | "admin";
export type BadgeConditionKind = "episodes_watched" | "franchises_completed" | "manual" | "admin_created";
export type ActivityKind =
  | "registered"
  | "library_added"
  | "episode_watched"
  | "badge_unlocked"
  | "badge_equipped"
  | "admin_action";

export type PublicUser = {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  profilePrivacy: PrivacyLevel;
  libraryPrivacy: PrivacyLevel;
  progressPrivacy: PrivacyLevel;
  activityPrivacy: PrivacyLevel;
  createdAt: string;
};

export type Franchise = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage?: string | null;
  bannerImage?: string | null;
  genres: string[];
  startYear?: number | null;
  status: AnimeStatus;
  isCompleteAdaptation: boolean;
  createdAt: string;
  updatedAt: string;
  collections: Collection[];
  works: Work[];
};

export type Collection = {
  id: string;
  franchiseId: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Work = {
  id: string;
  franchiseId: string;
  collectionId?: string | null;
  title: string;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  description?: string | null;
  coverImage?: string | null;
  bannerImage?: string | null;
  genres: string[];
  startYear?: number | null;
  format: WorkFormat;
  status: AnimeStatus;
  duration?: number | null;
  episodeCount?: number | null;
  anilistId?: number | null;
  malId?: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  seasons: Season[];
};

export type Season = {
  id: string;
  workId: string;
  title: string;
  sortOrder: number;
  episodeCount?: number | null;
  createdAt: string;
  updatedAt: string;
  episodes: Episode[];
};

export type Episode = {
  id: string;
  seasonId: string;
  title: string;
  number: number;
  duration?: number | null;
  airedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LibraryEntry = {
  id: string;
  userId: string;
  franchiseId: string;
  state: LibraryState;
  score?: number | null;
  favorite: boolean;
  notes?: string | null;
  addedAt: string;
  updatedAt: string;
  franchise?: Franchise;
  progress?: ProgressSummary;
};

export type EpisodeProgress = {
  id: string;
  userId: string;
  episodeId: string;
  completed: boolean;
  watchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Badge = {
  id: string;
  slug: string;
  name: string;
  description: string;
  rarity: BadgeRarity;
  category: BadgeCategory;
  conditionKind: BadgeConditionKind;
  conditionValue?: number | null;
};

export type UserBadge = {
  id: string;
  userId: string;
  badgeId: string;
  badge: Badge;
  unlockedAt: string;
  assignedBy?: string | null;
  equippedSlot?: number | null;
};

export type Activity = {
  id: string;
  userId: string;
  kind: ActivityKind;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type Report = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: "aperta" | "risolta" | "archiviata";
  moderatorId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgressSummary = {
  completedEpisodes: number;
  totalEpisodes: number;
  percentage: number;
  completedEpisodeIds: string[];
  nextEpisode?: {
    episode: Episode;
    season: Season;
    work: Work;
    franchise: Pick<Franchise, "id" | "slug" | "title" | "coverImage">;
  };
  works: Array<{
    workId: string;
    completedEpisodes: number;
    totalEpisodes: number;
    percentage: number;
  }>;
};

export type HomePayload = {
  user: PublicUser | null;
  stats: {
    libraryCount: number;
    completedEpisodes: number;
    completedFranchises: number;
    badges: number;
  };
  nextEpisode?: ProgressSummary["nextEpisode"];
  trending: Franchise[];
  recentFranchises: Franchise[];
  activities: Activity[];
  recommendations: Franchise[];
};

export type FranchiseFilters = {
  query?: string;
  genre?: string;
  year?: number;
  status?: AnimeStatus;
  sort?: "title" | "recent" | "year" | "works";
  page?: number;
};
