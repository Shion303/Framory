import type {
  Activity,
  Badge,
  EpisodeProgress,
  Franchise,
  FranchiseFilters,
  HomePayload,
  LibraryEntry,
  PublicUser,
  Report,
  UserBadge
} from "@/lib/types";
import type {
  collectionSchema,
  episodeSchema,
  franchiseSchema,
  libraryUpdateSchema,
  profileUpdateSchema,
  seasonSchema,
  userAdminUpdateSchema,
  workSchema
} from "@/lib/validation";
import type { AniListImportCandidate } from "@/server/anilist";
import type { z } from "zod";

export type UserWithPassword = PublicUser & { passwordHash: string };

export type CreateUserInput = {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
};

export type SessionResult = {
  token: string;
  expiresAt: string;
};

export type AdminSnapshot = {
  users: PublicUser[];
  reports: Report[];
  activities: Activity[];
  franchises: Franchise[];
  badges: Badge[];
};

export type FramoryStore = {
  ensureReady(): Promise<void>;
  resetForTests(): Promise<void>;
  createUser(input: CreateUserInput): Promise<PublicUser>;
  getUserByEmail(email: string): Promise<UserWithPassword | null>;
  getUserById(id: string): Promise<PublicUser | null>;
  createSession(userId: string): Promise<SessionResult>;
  getUserBySessionToken(token: string): Promise<PublicUser | null>;
  deleteSession(token: string): Promise<void>;
  listFranchises(filters?: FranchiseFilters): Promise<{ items: Franchise[]; total: number; page: number; pageSize: number }>;
  getFranchiseBySlug(slug: string): Promise<Franchise | null>;
  getFranchiseById(id: string): Promise<Franchise | null>;
  getFranchiseByWorkAniListId(anilistId: number): Promise<Franchise | null>;
  createFranchise(input: z.infer<typeof franchiseSchema>, actorId: string): Promise<Franchise>;
  updateFranchise(id: string, input: Partial<z.infer<typeof franchiseSchema>>, actorId: string): Promise<Franchise>;
  createCollection(input: z.infer<typeof collectionSchema>, actorId: string): Promise<Franchise>;
  createWork(input: z.infer<typeof workSchema>, actorId: string): Promise<Franchise>;
  autoImportAniListFranchises(candidates: AniListImportCandidate[], options?: { episodeCap?: number }): Promise<Franchise[]>;
  createSeason(input: z.infer<typeof seasonSchema>, actorId: string): Promise<Franchise>;
  createEpisode(input: z.infer<typeof episodeSchema>, actorId: string): Promise<Franchise>;
  deleteFranchise(id: string, actorId: string): Promise<void>;
  deleteWork(id: string, actorId: string): Promise<void>;
  deleteSeason(id: string, actorId: string): Promise<void>;
  deleteEpisode(id: string, actorId: string): Promise<void>;
  getLibrary(userId: string): Promise<LibraryEntry[]>;
  addToLibrary(userId: string, franchiseId: string): Promise<LibraryEntry>;
  updateLibrary(userId: string, franchiseId: string, input: z.infer<typeof libraryUpdateSchema>): Promise<LibraryEntry>;
  removeFromLibrary(userId: string, franchiseId: string): Promise<void>;
  getProgressRows(userId: string, franchiseId: string): Promise<EpisodeProgress[]>;
  toggleEpisode(userId: string, episodeId: string, completed: boolean): Promise<LibraryEntry>;
  getHome(userId?: string | null): Promise<HomePayload>;
  listBadges(userId?: string): Promise<{ badges: Badge[]; userBadges: UserBadge[] }>;
  equipBadge(userId: string, badgeId: string, slot: number): Promise<UserBadge[]>;
  grantBadge(actorId: string, userId: string, badgeId: string): Promise<UserBadge>;
  updateProfile(userId: string, input: z.infer<typeof profileUpdateSchema>): Promise<PublicUser>;
  getPublicProfile(username: string, viewerId?: string | null): Promise<{
    user: PublicUser;
    library: LibraryEntry[];
    badges: UserBadge[];
    activities: Activity[];
  } | null>;
  createReport(userId: string, input: { targetType: string; targetId: string; reason: string }): Promise<Report>;
  updateReport(actorId: string, reportId: string, status: Report["status"]): Promise<Report>;
  getMaintenanceMode(): Promise<boolean>;
  setMaintenanceMode(actorId: string, enabled: boolean): Promise<boolean>;
  getAdminSnapshot(): Promise<AdminSnapshot>;
  updateUser(actorId: string, userId: string, input: z.infer<typeof userAdminUpdateSchema>): Promise<PublicUser>;
};
