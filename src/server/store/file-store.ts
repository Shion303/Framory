import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { adminRoles } from "@/lib/constants";
import type {
  Activity,
  Badge,
  Episode,
  EpisodeProgress,
  Franchise,
  FranchiseChatMessage,
  FranchiseFilters,
  FriendRequest,
  Friendship,
  FriendshipState,
  HomePayload,
  LibraryEntry,
  PrivateMessage,
  PublicUser,
  Report,
  UserBadge
} from "@/lib/types";
import { clampScore, nowIso, slugify } from "@/lib/format";
import type { AniListImportCandidate } from "@/server/anilist";
import { calculateProgress } from "@/server/progress";
import { createSessionToken, hashPassword, hashSessionToken, sessionExpiryDate, verifyPassword } from "@/server/security";
import {
  ANILIST_COLLECTION_TITLE,
  animeTitleKeysForCandidate,
  animeTitleKeysForValues,
  anilistEpisodeCap,
  episodeDrafts,
  franchiseDescription,
  groupAniListCandidates,
  seasonTitle,
  titleKeysOverlap
} from "./anilist-import";
import { franchiseMatchesQuery, paginateFranchises, sortFranchises } from "./search";
import type { AdminSnapshot, CreateUserInput, FramoryStore, SessionResult, UserWithPassword } from "./types";

type UserRecord = PublicUser & { passwordHash: string };
type SessionRecord = { id: string; tokenHash: string; userId: string; expiresAt: string; createdAt: string };
type CollectionRecord = Omit<Franchise["collections"][number], "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
type WorkRecord = Omit<Franchise["works"][number], "seasons">;
type SeasonRecord = Omit<Franchise["works"][number]["seasons"][number], "episodes">;
type EpisodeRecord = Episode;
type ReportRecord = Report;
type AdminLog = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type DataFile = {
  users: UserRecord[];
  sessions: SessionRecord[];
  franchises: Omit<Franchise, "collections" | "works">[];
  collections: CollectionRecord[];
  works: WorkRecord[];
  seasons: SeasonRecord[];
  episodes: EpisodeRecord[];
  libraryEntries: LibraryEntry[];
  episodeProgress: EpisodeProgress[];
  badges: Badge[];
  userBadges: UserBadge[];
  friendRequests: FriendRequest[];
  friendships: Array<{ id: string; userAId: string; userBId: string; createdAt: string }>;
  privateMessages: PrivateMessage[];
  franchiseChatMessages: FranchiseChatMessage[];
  activities: Activity[];
  reports: ReportRecord[];
  adminLogs: AdminLog[];
  settings: {
    maintenanceMode: boolean;
  };
};

const emptyData = (): DataFile => ({
  users: [],
  sessions: [],
  franchises: [],
  collections: [],
  works: [],
  seasons: [],
  episodes: [],
  libraryEntries: [],
  episodeProgress: [],
  badges: [],
  userBadges: [],
  friendRequests: [],
  friendships: [],
  privateMessages: [],
  franchiseChatMessages: [],
  activities: [],
  reports: [],
  adminLogs: [],
  settings: {
    maintenanceMode: false
  }
});

const defaultBadges: Array<Omit<Badge, "id">> = [
  {
    slug: "primo-episodio",
    name: "Primo episodio",
    description: "Hai segnato il tuo primo episodio su Framory.",
    imageUrl: null,
    rarity: "comune",
    category: "tracking",
    kind: "milestone",
    conditionKind: "episodes_watched",
    conditionValue: 1,
    ownerOnly: false
  },
  {
    slug: "dieci-episodi",
    name: "Dieci episodi",
    description: "Hai completato dieci episodi.",
    imageUrl: null,
    rarity: "raro",
    category: "tracking",
    kind: "milestone",
    conditionKind: "episodes_watched",
    conditionValue: 10,
    ownerOnly: false
  },
  {
    slug: "franchise-completo",
    name: "Franchise completato",
    description: "Hai completato un intero franchise.",
    imageUrl: null,
    rarity: "epico",
    category: "collezione",
    kind: "milestone",
    conditionKind: "franchises_completed",
    conditionValue: 1,
    ownerOnly: false
  },
  {
    slug: "primo-franchise",
    name: "Primo franchise",
    description: "Hai aggiunto il tuo primo franchise alla libreria.",
    imageUrl: null,
    rarity: "comune",
    category: "collezione",
    kind: "milestone",
    conditionKind: "library_count",
    conditionValue: 1,
    ownerOnly: false
  },
  {
    slug: "primo-preferito",
    name: "Primo preferito",
    description: "Hai segnato un franchise come preferito.",
    imageUrl: null,
    rarity: "raro",
    category: "collezione",
    kind: "standard",
    conditionKind: "favorites_count",
    conditionValue: 1,
    ownerOnly: false
  },
  {
    slug: "profilo-curato",
    name: "Profilo curato",
    description: "Hai completato bio e immagine del profilo.",
    imageUrl: null,
    rarity: "raro",
    category: "community",
    kind: "standard",
    conditionKind: "profile_completed",
    conditionValue: null,
    ownerOnly: false
  },
  {
    slug: "curatore",
    name: "Curatore",
    description: "Hai contribuito alla struttura del catalogo.",
    imageUrl: null,
    rarity: "raro",
    category: "admin",
    kind: "esclusivo",
    conditionKind: "admin_created",
    conditionValue: 1,
    ownerOnly: false
  }
];

function publicUser(user: UserRecord): PublicUser {
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return safeUser;
}

function sortByOrder<T extends { sortOrder: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

function nullableUrl(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function friendshipPair(userId: string, friendId: string) {
  return [userId, friendId].sort() as [string, string];
}

export class FileStore implements FramoryStore {
  private readonly filePath: string;
  private ownerPasswordSynced = false;

  constructor(filePath = process.env.FRAMORY_DATA_FILE ?? ".framory/framory-data.json") {
    this.filePath = resolve(/*turbopackIgnore: true*/ process.cwd(), filePath);
  }

  async ensureReady() {
    await this.read();
  }

  private async prepare(data: DataFile) {
    let changed = false;

    for (const badge of defaultBadges) {
      if (!data.badges.some((item) => item.slug === badge.slug)) {
        data.badges.push({ id: randomUUID(), ...badge });
        changed = true;
      }
    }
    for (const badge of data.badges) {
      if (badge.imageUrl === undefined) {
        badge.imageUrl = null;
        changed = true;
      }
      if (badge.ownerOnly === undefined) {
        badge.ownerOnly = false;
        changed = true;
      }
      if (badge.kind === undefined) {
        badge.kind = badge.ownerOnly ? "esclusivo" : badge.conditionKind === "manual" ? "standard" : "milestone";
        changed = true;
      }
    }
    const userBadgesCount = data.userBadges.length;
    data.userBadges = data.userBadges.filter((userBadge) => {
      const badge = data.badges.find((item) => item.id === userBadge.badgeId);
      const user = data.users.find((item) => item.id === userBadge.userId);
      return !badge?.ownerOnly || user?.role === "owner";
    });
    if (data.userBadges.length !== userBadgesCount) {
      changed = true;
    }
    for (const userBadge of data.userBadges) {
      const badge = data.badges.find((item) => item.id === userBadge.badgeId);
      if (badge && userBadge.badge !== badge) {
        userBadge.badge = badge;
        changed = true;
      }
    }

    const ownerEmail = process.env.FRAMORY_OWNER_EMAIL?.trim().toLowerCase();
    const ownerPassword = process.env.FRAMORY_OWNER_PASSWORD;
    const ownerUsername = process.env.FRAMORY_OWNER_USERNAME ?? "owner";
    const ownerDisplayName = process.env.FRAMORY_OWNER_DISPLAY_NAME ?? "Owner Framory";
    if (ownerEmail && ownerPassword) {
      const now = nowIso();
      let owner = data.users.find((user) => user.email?.toLowerCase() === ownerEmail);
      if (!owner) {
        owner = {
          id: randomUUID(),
          email: ownerEmail,
          username: ownerUsername,
          displayName: ownerDisplayName,
          passwordHash: await hashPassword(ownerPassword),
          role: "owner",
          isActive: true,
          avatarUrl: null,
          bannerUrl: null,
          bio: "Account owner generato da variabili ambiente.",
          profilePrivacy: "pubblico",
          libraryPrivacy: "pubblico",
          progressPrivacy: "pubblico",
          activityPrivacy: "pubblico",
          createdAt: now
        };
        data.users.push(owner);
        this.ownerPasswordSynced = true;
        changed = true;
      }
      for (const user of data.users) {
        if (user.email?.toLowerCase() !== ownerEmail && user.role === "owner") {
          user.role = "admin";
          changed = true;
        }
      }
      if (owner.role !== "owner") {
        owner.role = "owner";
        changed = true;
      }
      if (!owner.isActive) {
        owner.isActive = true;
        changed = true;
      }
      if (!this.ownerPasswordSynced && !(await verifyPassword(ownerPassword, owner.passwordHash))) {
        owner.passwordHash = await hashPassword(ownerPassword);
        data.sessions = data.sessions.filter((session) => session.userId !== owner.id);
        changed = true;
      }
      this.ownerPasswordSynced = true;
    }

    return changed;
  }

  async resetForTests() {
    if (process.env.FRAMORY_ALLOW_TEST_RESET !== "1") {
      throw new Error("Reset test non consentito in questo ambiente.");
    }
    this.ownerPasswordSynced = false;
    await rm(this.filePath, { force: true });
    await this.ensureReady();
  }

  async createUser(input: CreateUserInput) {
    const data = await this.read();
    const email = input.email.toLowerCase();
    if (data.users.some((user) => user.email === email)) {
      throw new Error("Email già registrata.");
    }
    if (data.users.some((user) => user.username.toLowerCase() === input.username.toLowerCase())) {
      throw new Error("Username già registrato.");
    }
    const now = nowIso();
    const user: UserRecord = {
      id: randomUUID(),
      email,
      username: input.username,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: "user",
      isActive: true,
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      profilePrivacy: "pubblico",
      libraryPrivacy: "pubblico",
      progressPrivacy: "pubblico",
      activityPrivacy: "pubblico",
      createdAt: now
    };
    data.users.push(user);
    data.activities.push({
      id: randomUUID(),
      userId: user.id,
      kind: "registered",
      message: "Si è unito a Framory.",
      createdAt: now
    });
    await this.write(data);
    return publicUser(user);
  }

  async getUserByEmail(email: string): Promise<UserWithPassword | null> {
    const data = await this.read();
    return data.users.find((user) => user.email === email.toLowerCase()) ?? null;
  }

  async getUserById(id: string) {
    const data = await this.read();
    const user = data.users.find((item) => item.id === id);
    return user ? publicUser(user) : null;
  }

  async createSession(userId: string): Promise<SessionResult> {
    const data = await this.read();
    const token = createSessionToken();
    const expiresAt = sessionExpiryDate().toISOString();
    data.sessions.push({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
      createdAt: nowIso()
    });
    await this.write(data);
    return { token, expiresAt };
  }

  async getUserBySessionToken(token: string) {
    const data = await this.read();
    const tokenHash = hashSessionToken(token);
    const session = data.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      return null;
    }
    const user = data.users.find((item) => item.id === session.userId && item.isActive);
    return user ? publicUser(user) : null;
  }

  async deleteSession(token: string) {
    const data = await this.read();
    const tokenHash = hashSessionToken(token);
    data.sessions = data.sessions.filter((item) => item.tokenHash !== tokenHash);
    await this.write(data);
  }

  async listFranchises(filters: FranchiseFilters = {}) {
    const data = await this.read();
    const pageSize = 12;
    const page = Math.max(1, filters.page ?? 1);
    let items = data.franchises.map((franchise) => this.hydrateFranchise(data, franchise.id)).filter(Boolean) as Franchise[];

    if (filters.query) {
      items = items.filter((item) => franchiseMatchesQuery(item, filters.query as string));
    }
    if (filters.genre) {
      items = items.filter((item) => item.genres.some((genre) => genre.toLowerCase() === filters.genre?.toLowerCase()));
    }
    if (filters.year) {
      items = items.filter((item) => item.startYear === filters.year);
    }
    if (filters.status) {
      items = items.filter((item) => item.status === filters.status);
    }

    return paginateFranchises(sortFranchises(items, filters.sort), page, pageSize);
  }

  async listAniListWorkIds(limit = 12) {
    const data = await this.read();
    const ids = data.works
      .map((work) => work.anilistId)
      .filter((id): id is number => typeof id === "number");
    return Array.from(new Set(ids)).slice(0, Math.max(1, limit));
  }

  async getFranchiseBySlug(slug: string) {
    const data = await this.read();
    const franchise = data.franchises.find((item) => item.slug === slug);
    return franchise ? this.hydrateFranchise(data, franchise.id) : null;
  }

  async getFranchiseById(id: string) {
    const data = await this.read();
    return this.hydrateFranchise(data, id);
  }

  async getFranchiseByWorkAniListId(anilistId: number) {
    const data = await this.read();
    const work = data.works.find((item) => item.anilistId === anilistId);
    return work ? this.hydrateFranchise(data, work.franchiseId) : null;
  }

  async createFranchise(input: Parameters<FramoryStore["createFranchise"]>[0], actorId: string) {
    const data = await this.read();
    const now = nowIso();
    const baseSlug = slugify(input.title);
    let slug = baseSlug;
    let suffix = 2;
    while (data.franchises.some((item) => item.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const franchise = {
      id: randomUUID(),
      slug,
      title: input.title,
      description: input.description,
      coverImage: nullableUrl(input.coverImage),
      bannerImage: nullableUrl(input.bannerImage),
      genres: input.genres,
      startYear: input.startYear ?? null,
      status: input.status,
      isCompleteAdaptation: input.isCompleteAdaptation,
      createdAt: now,
      updatedAt: now
    };
    data.franchises.push(franchise);
    this.adminLog(data, actorId, "Crea franchise", franchise.id, { title: input.title });
    this.unlockAdminCreatedBadge(data, actorId);
    await this.write(data);
    return this.hydrateFranchise(data, franchise.id) as Franchise;
  }

  async updateFranchise(id: string, input: Parameters<FramoryStore["updateFranchise"]>[1], actorId: string) {
    const data = await this.read();
    const franchise = data.franchises.find((item) => item.id === id);
    if (!franchise) {
      throw new Error("Franchise non trovato.");
    }
    Object.assign(franchise, {
      ...input,
      coverImage: nullableUrl(input.coverImage ?? franchise.coverImage),
      bannerImage: nullableUrl(input.bannerImage ?? franchise.bannerImage),
      updatedAt: nowIso()
    });
    this.adminLog(data, actorId, "Aggiorna franchise", id, { title: franchise.title });
    await this.write(data);
    return this.hydrateFranchise(data, id) as Franchise;
  }

  async createCollection(input: Parameters<FramoryStore["createCollection"]>[0], actorId: string) {
    const data = await this.read();
    this.assertFranchise(data, input.franchiseId);
    const now = nowIso();
    data.collections.push({
      id: randomUUID(),
      franchiseId: input.franchiseId,
      title: input.title,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    });
    this.adminLog(data, actorId, "Crea collection", input.franchiseId, { title: input.title });
    await this.write(data);
    return this.hydrateFranchise(data, input.franchiseId) as Franchise;
  }

  async createWork(input: Parameters<FramoryStore["createWork"]>[0], actorId: string) {
    const data = await this.read();
    this.assertFranchise(data, input.franchiseId);
    if (input.collectionId && !data.collections.some((item) => item.id === input.collectionId)) {
      throw new Error("Collection non trovata.");
    }
    if (input.anilistId && data.works.some((item) => item.anilistId === input.anilistId)) {
      throw new Error("Opera già importata da AniList.");
    }
    const now = nowIso();
    data.works.push({
      id: randomUUID(),
      franchiseId: input.franchiseId,
      collectionId: input.collectionId || null,
      title: input.title,
      titleRomaji: input.titleRomaji ?? null,
      titleEnglish: input.titleEnglish ?? null,
      titleNative: input.titleNative ?? null,
      description: input.description ?? null,
      coverImage: nullableUrl(input.coverImage),
      bannerImage: nullableUrl(input.bannerImage),
      genres: input.genres,
      startYear: input.startYear ?? null,
      format: input.format,
      status: input.status,
      duration: input.duration ?? null,
      episodeCount: input.episodeCount ?? null,
      anilistId: input.anilistId ?? null,
      malId: input.malId ?? null,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    });
    this.adminLog(data, actorId, "Crea work", input.franchiseId, { title: input.title });
    this.unlockAdminCreatedBadge(data, actorId);
    await this.write(data);
    return this.hydrateFranchise(data, input.franchiseId) as Franchise;
  }

  async autoImportAniListFranchises(candidates: AniListImportCandidate[], options?: { episodeCap?: number }) {
    const data = await this.read();
    const touched = new Set<string>();
    const cap = anilistEpisodeCap(options);

    for (const group of groupAniListCandidates(candidates)) {
      const now = nowIso();
      const titleKeys = group.candidates.flatMap((candidate) => animeTitleKeysForCandidate(candidate));
      let franchiseId = this.findFranchiseIdByAniListIds(data, group.ids) ?? this.findFranchiseIdByTitleKeys(data, titleKeys);

      if (!franchiseId) {
        franchiseId = this.createAniListFranchise(data, group.primary, now);
      }

      const collectionId = this.ensureAniListCollection(data, franchiseId, now);
      this.mergeAniListFranchises(data, franchiseId, group.ids, collectionId, titleKeys);

      let sortOrder = data.works.filter((work) => work.franchiseId === franchiseId).length;
      for (const candidate of group.candidates) {
        if (data.works.some((item) => item.anilistId === candidate.anilistId)) {
          continue;
        }
        this.addAniListWork(data, franchiseId, collectionId, candidate, cap, sortOrder, now);
        sortOrder += 1;
      }
      touched.add(franchiseId);
    }

    const touchedFranchises = Array.from(touched)
      .map((franchiseId) => this.hydrateFranchise(data, franchiseId))
      .filter(Boolean) as Franchise[];

    if (touchedFranchises.length) {
      await this.write(data);
    }
    return touchedFranchises;
  }

  async createSeason(input: Parameters<FramoryStore["createSeason"]>[0], actorId: string) {
    const data = await this.read();
    const work = data.works.find((item) => item.id === input.workId);
    if (!work) {
      throw new Error("Work non trovato.");
    }
    const now = nowIso();
    data.seasons.push({
      id: randomUUID(),
      workId: input.workId,
      title: input.title,
      sortOrder: input.sortOrder,
      episodeCount: input.episodeCount ?? null,
      createdAt: now,
      updatedAt: now
    });
    this.adminLog(data, actorId, "Crea season", work.franchiseId, { title: input.title });
    await this.write(data);
    return this.hydrateFranchise(data, work.franchiseId) as Franchise;
  }

  async createEpisode(input: Parameters<FramoryStore["createEpisode"]>[0], actorId: string) {
    const data = await this.read();
    const season = data.seasons.find((item) => item.id === input.seasonId);
    if (!season) {
      throw new Error("Season non trovata.");
    }
    if (data.episodes.some((item) => item.seasonId === input.seasonId && item.number === input.number)) {
      throw new Error("Numero episodio già presente in questa stagione.");
    }
    const work = data.works.find((item) => item.id === season.workId);
    if (!work) {
      throw new Error("Work non trovato.");
    }
    const now = nowIso();
    data.episodes.push({
      id: randomUUID(),
      seasonId: input.seasonId,
      title: input.title,
      number: input.number,
      duration: input.duration ?? null,
      airedAt: input.airedAt ?? null,
      createdAt: now,
      updatedAt: now
    });
    this.adminLog(data, actorId, "Crea episodio", work.franchiseId, { title: input.title, number: input.number });
    await this.write(data);
    return this.hydrateFranchise(data, work.franchiseId) as Franchise;
  }

  async deleteFranchise(id: string, actorId: string) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const workIds = new Set(data.works.filter((work) => work.franchiseId === id).map((work) => work.id));
    const seasonIds = new Set(data.seasons.filter((season) => workIds.has(season.workId)).map((season) => season.id));
    const episodeIds = new Set(data.episodes.filter((episode) => seasonIds.has(episode.seasonId)).map((episode) => episode.id));
    data.franchises = data.franchises.filter((franchise) => franchise.id !== id);
    data.collections = data.collections.filter((collection) => collection.franchiseId !== id);
    data.works = data.works.filter((work) => work.franchiseId !== id);
    data.seasons = data.seasons.filter((season) => !workIds.has(season.workId));
    data.episodes = data.episodes.filter((episode) => !seasonIds.has(episode.seasonId));
    data.libraryEntries = data.libraryEntries.filter((entry) => entry.franchiseId !== id);
    data.episodeProgress = data.episodeProgress.filter((row) => !episodeIds.has(row.episodeId));
    this.adminLog(data, actorId, "Elimina franchise", id);
    await this.write(data);
  }

  async deleteWork(id: string, actorId: string) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const work = data.works.find((item) => item.id === id);
    if (!work) {
      throw new Error("Work non trovato.");
    }
    const seasonIds = new Set(data.seasons.filter((season) => season.workId === id).map((season) => season.id));
    const episodeIds = new Set(data.episodes.filter((episode) => seasonIds.has(episode.seasonId)).map((episode) => episode.id));
    data.works = data.works.filter((item) => item.id !== id);
    data.seasons = data.seasons.filter((season) => season.workId !== id);
    data.episodes = data.episodes.filter((episode) => !seasonIds.has(episode.seasonId));
    data.episodeProgress = data.episodeProgress.filter((row) => !episodeIds.has(row.episodeId));
    this.adminLog(data, actorId, "Elimina work", work.franchiseId, { workId: id });
    await this.write(data);
  }

  async deleteSeason(id: string, actorId: string) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const season = data.seasons.find((item) => item.id === id);
    if (!season) {
      throw new Error("Season non trovata.");
    }
    const work = data.works.find((item) => item.id === season.workId);
    const episodeIds = new Set(data.episodes.filter((episode) => episode.seasonId === id).map((episode) => episode.id));
    data.seasons = data.seasons.filter((item) => item.id !== id);
    data.episodes = data.episodes.filter((episode) => episode.seasonId !== id);
    data.episodeProgress = data.episodeProgress.filter((row) => !episodeIds.has(row.episodeId));
    this.adminLog(data, actorId, "Elimina season", work?.franchiseId ?? id, { seasonId: id });
    await this.write(data);
  }

  async deleteEpisode(id: string, actorId: string) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const episode = data.episodes.find((item) => item.id === id);
    if (!episode) {
      throw new Error("Episodio non trovato.");
    }
    data.episodes = data.episodes.filter((item) => item.id !== id);
    data.episodeProgress = data.episodeProgress.filter((row) => row.episodeId !== id);
    this.adminLog(data, actorId, "Elimina episodio", episode.seasonId, { episodeId: id });
    await this.write(data);
  }

  async getLibrary(userId: string) {
    const data = await this.read();
    return data.libraryEntries
      .filter((entry) => entry.userId === userId)
      .map((entry) => this.withLibraryDetails(data, entry))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async addToLibrary(userId: string, franchiseId: string) {
    const data = await this.read();
    this.assertFranchise(data, franchiseId);
    const existing = data.libraryEntries.find((entry) => entry.userId === userId && entry.franchiseId === franchiseId);
    if (existing) {
      return this.withLibraryDetails(data, existing);
    }
    const now = nowIso();
    const entry: LibraryEntry = {
      id: randomUUID(),
      userId,
      franchiseId,
      state: "pianificato",
      score: null,
      favorite: false,
      notes: null,
      addedAt: now,
      updatedAt: now
    };
    data.libraryEntries.push(entry);
    data.activities.push({
      id: randomUUID(),
      userId,
      kind: "library_added",
      message: "Ha aggiunto un franchise alla libreria.",
      metadata: { franchiseId },
      createdAt: now
    });
    this.unlockAutomaticBadges(data, userId);
    await this.write(data);
    return this.withLibraryDetails(data, entry);
  }

  async updateLibrary(userId: string, franchiseId: string, input: Parameters<FramoryStore["updateLibrary"]>[2]) {
    const data = await this.read();
    const entry = data.libraryEntries.find((item) => item.userId === userId && item.franchiseId === franchiseId);
    if (!entry) {
      throw new Error("Franchise non presente nella libreria.");
    }
    Object.assign(entry, {
      state: input.state ?? entry.state,
      score: input.score === undefined ? entry.score : clampScore(input.score),
      favorite: input.favorite ?? entry.favorite,
      notes: input.notes === undefined ? entry.notes : input.notes,
      updatedAt: nowIso()
    });
    this.unlockAutomaticBadges(data, userId);
    await this.write(data);
    return this.withLibraryDetails(data, entry);
  }

  async removeFromLibrary(userId: string, franchiseId: string) {
    const data = await this.read();
    data.libraryEntries = data.libraryEntries.filter((entry) => !(entry.userId === userId && entry.franchiseId === franchiseId));
    const episodeIds = this.episodeIdsForFranchise(data, franchiseId);
    data.episodeProgress = data.episodeProgress.filter((row) => row.userId !== userId || !episodeIds.has(row.episodeId));
    await this.write(data);
  }

  async getProgressRows(userId: string, franchiseId: string) {
    const data = await this.read();
    const episodeIds = this.episodeIdsForFranchise(data, franchiseId);
    return data.episodeProgress.filter((row) => row.userId === userId && episodeIds.has(row.episodeId));
  }

  async toggleEpisode(userId: string, episodeId: string, completed: boolean) {
    const data = await this.read();
    const episode = data.episodes.find((item) => item.id === episodeId);
    if (!episode) {
      throw new Error("Episodio non trovato.");
    }
    const season = data.seasons.find((item) => item.id === episode.seasonId);
    const work = season ? data.works.find((item) => item.id === season.workId) : null;
    if (!season || !work) {
      throw new Error("Gerarchia episodio non valida.");
    }
    const entry = data.libraryEntries.find((item) => item.userId === userId && item.franchiseId === work.franchiseId);
    if (!entry) {
      throw new Error("Aggiungi il franchise alla libreria prima di tracciare gli episodi.");
    }
    const now = nowIso();
    let row = data.episodeProgress.find((item) => item.userId === userId && item.episodeId === episodeId);
    if (!row) {
      row = {
        id: randomUUID(),
        userId,
        episodeId,
        completed,
        watchedAt: completed ? now : null,
        createdAt: now,
        updatedAt: now
      };
      data.episodeProgress.push(row);
    } else {
      row.completed = completed;
      row.watchedAt = completed ? now : null;
      row.updatedAt = now;
    }
    if (completed) {
      data.activities.push({
        id: randomUUID(),
        userId,
        kind: "episode_watched",
        message: `Ha completato l'episodio ${episode.number}.`,
        metadata: { episodeId, franchiseId: work.franchiseId },
        createdAt: now
      });
    }
    const franchise = this.hydrateFranchise(data, work.franchiseId) as Franchise;
    const progress = calculateProgress(franchise, data.episodeProgress.filter((item) => item.userId === userId));
    entry.state = progress.totalEpisodes > 0 && progress.completedEpisodes === progress.totalEpisodes ? "completato" : "in_visione";
    entry.updatedAt = now;
    this.unlockAutomaticBadges(data, userId);
    await this.write(data);
    return this.withLibraryDetails(data, entry);
  }

  async getHome(userId?: string | null): Promise<HomePayload> {
    const data = await this.read();
    const user = userId ? data.users.find((item) => item.id === userId) : null;
    const library = user ? await this.getLibrary(user.id) : [];
    const completedEpisodes = user
      ? data.episodeProgress.filter((row) => row.userId === user.id && row.completed).length
      : 0;
    const completedFranchises = library.filter((entry) => entry.state === "completato").length;
    const nextEpisode = library.map((entry) => entry.progress?.nextEpisode).find(Boolean);
    const recentFranchises = (await this.listFranchises({ sort: "recent" })).items.slice(0, 6);
    const favoriteGenres = new Set(
      library
        .filter((entry) => entry.favorite)
        .flatMap((entry) => entry.franchise?.genres ?? [])
        .map((genre) => genre.toLowerCase())
    );
    const recommendations = favoriteGenres.size
      ? recentFranchises.filter((franchise) => franchise.genres.some((genre) => favoriteGenres.has(genre.toLowerCase())))
      : recentFranchises.slice(0, 3);

    return {
      user: user ? publicUser(user) : null,
      stats: {
        libraryCount: library.length,
        completedEpisodes,
        completedFranchises,
        badges: user ? data.userBadges.filter((badge) => badge.userId === user.id).length : 0
      },
      nextEpisode,
      trending: (await this.listFranchises({ sort: "works" })).items.slice(0, 6),
      recentFranchises,
      activities: data.activities.slice(-8).reverse(),
      recommendations
    };
  }

  async listBadges(userId?: string) {
    const data = await this.read();
    if (userId) {
      const unlockedBefore = data.userBadges.length;
      this.unlockAutomaticBadges(data, userId);
      if (data.userBadges.length !== unlockedBefore) {
        await this.write(data);
      }
    }
    return {
      badges: [...data.badges].sort((a, b) => a.name.localeCompare(b.name, "it")),
      userBadges: userId ? data.userBadges.filter((item) => item.userId === userId) : []
    };
  }

  async createBadge(actorId: string, input: Parameters<FramoryStore["createBadge"]>[1]) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    if (data.badges.some((badge) => badge.slug === input.slug)) {
      throw new Error("Esiste gia un badge con questo slug.");
    }
    const badge: Badge = {
      id: randomUUID(),
      ...input,
      imageUrl: nullableUrl(input.imageUrl),
      kind: input.kind ?? "standard",
      conditionValue: input.conditionValue ?? null,
      ownerOnly: input.ownerOnly ?? false
    };
    data.badges.push(badge);
    this.adminLog(data, actorId, "Crea badge", badge.id, { slug: badge.slug, name: badge.name });
    await this.write(data);
    return badge;
  }

  async updateBadge(actorId: string, badgeId: string, input: Parameters<FramoryStore["updateBadge"]>[2]) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const badge = data.badges.find((item) => item.id === badgeId);
    if (!badge) {
      throw new Error("Badge non trovato.");
    }
    if (input.slug && data.badges.some((item) => item.id !== badgeId && item.slug === input.slug)) {
      throw new Error("Esiste gia un badge con questo slug.");
    }
    Object.assign(badge, {
      ...input,
      imageUrl: input.imageUrl === undefined ? badge.imageUrl : nullableUrl(input.imageUrl),
      kind: input.kind ?? badge.kind,
      conditionValue: input.conditionValue === undefined ? badge.conditionValue : input.conditionValue,
      ownerOnly: input.ownerOnly ?? badge.ownerOnly
    });
    if (badge.ownerOnly) {
      data.userBadges = data.userBadges.filter((item) => {
        const user = data.users.find((candidate) => candidate.id === item.userId);
        return item.badgeId !== badgeId || user?.role === "owner";
      });
    }
    for (const userBadge of data.userBadges.filter((item) => item.badgeId === badgeId)) {
      userBadge.badge = badge;
    }
    this.adminLog(data, actorId, "Aggiorna badge", badge.id, { slug: badge.slug, name: badge.name });
    await this.write(data);
    return badge;
  }

  async deleteBadge(actorId: string, badgeId: string) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const badge = data.badges.find((item) => item.id === badgeId);
    if (!badge) {
      throw new Error("Badge non trovato.");
    }
    data.badges = data.badges.filter((item) => item.id !== badgeId);
    data.userBadges = data.userBadges.filter((item) => item.badgeId !== badgeId);
    this.adminLog(data, actorId, "Elimina badge", badgeId, { slug: badge.slug, name: badge.name });
    await this.write(data);
  }

  async equipBadge(userId: string, badgeId: string, slot: number) {
    if (slot < 1 || slot > 3) {
      throw new Error("Puoi equipaggiare badge solo negli slot 1, 2 o 3.");
    }
    const data = await this.read();
    const owned = data.userBadges.find((item) => item.userId === userId && item.badgeId === badgeId);
    if (!owned) {
      throw new Error("Badge non ancora sbloccato.");
    }
    for (const userBadge of data.userBadges.filter((item) => item.userId === userId)) {
      if (userBadge.equippedSlot === slot || userBadge.badgeId === badgeId) {
        userBadge.equippedSlot = null;
      }
    }
    owned.equippedSlot = slot;
    data.activities.push({
      id: randomUUID(),
      userId,
      kind: "badge_equipped",
      message: "Ha equipaggiato un badge.",
      metadata: { badgeId, slot },
      createdAt: nowIso()
    });
    await this.write(data);
    return data.userBadges.filter((item) => item.userId === userId);
  }

  async grantBadge(actorId: string, userId: string, badgeId: string) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const granted = this.unlockBadge(data, userId, badgeId, actorId);
    this.adminLog(data, actorId, "Assegna badge", userId, { badgeId });
    await this.write(data);
    return granted;
  }

  async updateProfile(userId: string, input: Parameters<FramoryStore["updateProfile"]>[1]) {
    const data = await this.read();
    const user = data.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("Utente non trovato.");
    }
    Object.assign(user, {
      ...input,
      avatarUrl: nullableUrl(input.avatarUrl ?? user.avatarUrl),
      bannerUrl: nullableUrl(input.bannerUrl ?? user.bannerUrl)
    });
    this.unlockAutomaticBadges(data, userId);
    await this.write(data);
    return publicUser(user);
  }

  async getPublicProfile(username: string, viewerId?: string | null) {
    const data = await this.read();
    const user = data.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || !user.isActive) {
      return null;
    }
    const viewer = viewerId ? data.users.find((item) => item.id === viewerId) : null;
    const canSeePrivate = viewer?.id === user.id || (viewer ? adminRoles.includes(viewer.role) : false);
    if (user.profilePrivacy === "privato" && !canSeePrivate) {
      return { user: publicUser(user), library: [], badges: [], activities: [] };
    }
    return {
      user: publicUser(user),
      library: user.libraryPrivacy === "privato" && !canSeePrivate ? [] : await this.getLibrary(user.id),
      badges: data.userBadges.filter((badge) => badge.userId === user.id),
      activities:
        user.activityPrivacy === "privato" && !canSeePrivate
          ? []
          : data.activities.filter((activity) => activity.userId === user.id).slice(-12).reverse()
    };
  }

  async createReport(userId: string, input: { targetType: string; targetId: string; reason: string }) {
    const data = await this.read();
    const now = nowIso();
    const report: Report = {
      id: randomUUID(),
      reporterId: userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      status: "aperta",
      moderatorId: null,
      createdAt: now,
      updatedAt: now
    };
    data.reports.push(report);
    await this.write(data);
    return report;
  }

  async updateReport(actorId: string, reportId: string, status: Report["status"]) {
    const data = await this.read();
    const actor = data.users.find((item) => item.id === actorId);
    if (!actor || !["owner", "admin", "moderator"].includes(actor.role)) {
      throw new Error("Permesso moderazione richiesto.");
    }
    const report = data.reports.find((item) => item.id === reportId);
    if (!report) {
      throw new Error("Segnalazione non trovata.");
    }
    report.status = status;
    report.moderatorId = actorId;
    report.updatedAt = nowIso();
    this.adminLog(data, actorId, "Aggiorna segnalazione", reportId, { status });
    await this.write(data);
    return report;
  }

  async getMaintenanceMode() {
    const data = await this.read();
    return data.settings.maintenanceMode;
  }

  async setMaintenanceMode(actorId: string, enabled: boolean) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    data.settings.maintenanceMode = enabled;
    this.adminLog(data, actorId, "Aggiorna manutenzione", "platform", { enabled });
    await this.write(data);
    return enabled;
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    const data = await this.read();
    return {
      users: data.users.map(publicUser),
      reports: data.reports,
      activities: data.activities.slice(-40).reverse(),
      franchises: data.franchises.map((item) => this.hydrateFranchise(data, item.id)).filter(Boolean) as Franchise[],
      badges: data.badges
    };
  }

  async updateUser(actorId: string, userId: string, input: Parameters<FramoryStore["updateUser"]>[2]) {
    const data = await this.read();
    this.assertAdmin(data, actorId);
    const actor = data.users.find((item) => item.id === actorId);
    const user = data.users.find((item) => item.id === userId);
    if (!actor || !user) {
      throw new Error("Utente non trovato.");
    }
    if (user.role === "owner" && actor.id !== user.id) {
      throw new Error("L'owner non può essere modificato da altri account.");
    }
    if (input.role && actor.role !== "owner") {
      throw new Error("Solo l'owner può modificare i ruoli.");
    }
    Object.assign(user, input);
    this.adminLog(data, actorId, "Aggiorna utente", userId, input);
    await this.write(data);
    return publicUser(user);
  }

  async searchUsers(viewerId: string, query: string) {
    const data = await this.read();
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) {
      return [];
    }
    return data.users
      .filter((user) => user.isActive)
      .filter((user) => user.displayName.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((user) => ({
        ...publicUser(user),
        friendship: this.friendshipState(data, viewerId, user.id)
      }));
  }

  async getSocialSummary(userId: string) {
    const data = await this.read();
    return {
      friends: this.friendshipsForUser(data, userId),
      incoming: data.friendRequests
        .filter((request) => request.addresseeId === userId && request.status === "in_attesa")
        .map((request) => this.friendRequest(data, request)),
      outgoing: data.friendRequests
        .filter((request) => request.requesterId === userId && request.status === "in_attesa")
        .map((request) => this.friendRequest(data, request))
    };
  }

  async sendFriendRequest(userId: string, targetId: string) {
    const data = await this.read();
    if (userId === targetId) {
      throw new Error("Non puoi inviare una richiesta a te stesso.");
    }
    this.assertActiveUser(data, userId);
    this.assertActiveUser(data, targetId);
    if (this.areFriends(data, userId, targetId)) {
      throw new Error("Siete gia amici.");
    }
    const reverse = data.friendRequests.find((request) => request.requesterId === targetId && request.addresseeId === userId && request.status === "in_attesa");
    if (reverse) {
      return this.acceptFriendRequest(data, userId, reverse.id);
    }
    const existing = data.friendRequests.find((request) => request.requesterId === userId && request.addresseeId === targetId);
    if (existing) {
      existing.status = "in_attesa";
      existing.updatedAt = nowIso();
      await this.write(data);
      return this.friendRequest(data, existing);
    }
    const now = nowIso();
    const request: FriendRequest = {
      id: randomUUID(),
      requesterId: userId,
      addresseeId: targetId,
      status: "in_attesa",
      requester: publicUser(data.users.find((user) => user.id === userId)!),
      addressee: publicUser(data.users.find((user) => user.id === targetId)!),
      createdAt: now,
      updatedAt: now
    };
    data.friendRequests.push(request);
    await this.write(data);
    return this.friendRequest(data, request);
  }

  async respondFriendRequest(userId: string, requestId: string, action: "accept" | "decline") {
    const data = await this.read();
    if (action === "accept") {
      return this.acceptFriendRequest(data, userId, requestId);
    }
    const request = data.friendRequests.find((item) => item.id === requestId);
    if (!request || request.addresseeId !== userId) {
      throw new Error("Richiesta amicizia non trovata.");
    }
    request.status = "rifiutata";
    request.updatedAt = nowIso();
    await this.write(data);
    return this.friendRequest(data, request);
  }

  async removeFriend(userId: string, friendId: string) {
    const data = await this.read();
    const [userAId, userBId] = friendshipPair(userId, friendId);
    data.friendships = data.friendships.filter((friendship) => !(friendship.userAId === userAId && friendship.userBId === userBId));
    await this.write(data);
  }

  async getPrivateMessages(userId: string, friendId: string) {
    const data = await this.read();
    if (!this.areFriends(data, userId, friendId)) {
      throw new Error("Puoi leggere messaggi privati solo con gli amici.");
    }
    return data.privateMessages
      .filter((message) => (message.senderId === userId && message.receiverId === friendId) || (message.senderId === friendId && message.receiverId === userId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-80)
      .map((message) => this.privateMessage(data, message));
  }

  async sendPrivateMessage(userId: string, friendId: string, body: string) {
    const data = await this.read();
    if (!this.areFriends(data, userId, friendId)) {
      throw new Error("Puoi inviare messaggi privati solo agli amici.");
    }
    const text = body.trim();
    if (!text) {
      throw new Error("Messaggio vuoto.");
    }
    const message: PrivateMessage = {
      id: randomUUID(),
      senderId: userId,
      receiverId: friendId,
      body: text.slice(0, 1000),
      createdAt: nowIso(),
      sender: publicUser(data.users.find((user) => user.id === userId)!),
      receiver: publicUser(data.users.find((user) => user.id === friendId)!)
    };
    data.privateMessages.push(message);
    await this.write(data);
    return this.privateMessage(data, message);
  }

  async getFranchiseChat(_userId: string, franchiseId: string) {
    const data = await this.read();
    this.assertFranchise(data, franchiseId);
    return data.franchiseChatMessages
      .filter((message) => message.franchiseId === franchiseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-100)
      .map((message) => this.franchiseChatMessage(data, message));
  }

  async sendFranchiseChatMessage(userId: string, franchiseId: string, body: string) {
    const data = await this.read();
    this.assertActiveUser(data, userId);
    this.assertFranchise(data, franchiseId);
    const text = body.trim();
    if (!text) {
      throw new Error("Messaggio vuoto.");
    }
    const message: FranchiseChatMessage = {
      id: randomUUID(),
      franchiseId,
      userId,
      body: text.slice(0, 1000),
      createdAt: nowIso(),
      user: publicUser(data.users.find((user) => user.id === userId)!)
    };
    data.franchiseChatMessages.push(message);
    await this.write(data);
    return this.franchiseChatMessage(data, message);
  }

  private async read(): Promise<DataFile> {
    await mkdir(dirname(this.filePath), { recursive: true });
    let data: DataFile;
    try {
      const raw = await readFile(this.filePath, "utf8");
      data = { ...emptyData(), ...JSON.parse(raw) } as DataFile;
    } catch {
      data = emptyData();
    }
    if (await this.prepare(data)) {
      await this.write(data);
    }
    return data;
  }

  private async write(data: DataFile) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  private hydrateFranchise(data: DataFile, id: string): Franchise | null {
    const franchise = data.franchises.find((item) => item.id === id);
    if (!franchise) {
      return null;
    }
    const works = sortByOrder(data.works.filter((work) => work.franchiseId === id)).map((work) => ({
      ...work,
      seasons: sortByOrder(data.seasons.filter((season) => season.workId === work.id)).map((season) => ({
        ...season,
        episodes: [...data.episodes.filter((episode) => episode.seasonId === season.id)].sort((a, b) => a.number - b.number)
      }))
    }));
    return {
      ...franchise,
      collections: sortByOrder(data.collections.filter((collection) => collection.franchiseId === id)),
      works
    };
  }

  private withLibraryDetails(data: DataFile, entry: LibraryEntry): LibraryEntry {
    const franchise = this.hydrateFranchise(data, entry.franchiseId) ?? undefined;
    const progress = franchise
      ? calculateProgress(franchise, data.episodeProgress.filter((row) => row.userId === entry.userId))
      : undefined;
    return { ...entry, franchise, progress };
  }

  private episodeIdsForFranchise(data: DataFile, franchiseId: string) {
    const workIds = new Set(data.works.filter((work) => work.franchiseId === franchiseId).map((work) => work.id));
    const seasonIds = new Set(data.seasons.filter((season) => workIds.has(season.workId)).map((season) => season.id));
    return new Set(data.episodes.filter((episode) => seasonIds.has(episode.seasonId)).map((episode) => episode.id));
  }

  private findFranchiseIdByAniListIds(data: DataFile, ids: number[]) {
    const idSet = new Set(ids);
    const matching = data.works.filter((work) => typeof work.anilistId === "number" && idSet.has(work.anilistId));
    if (!matching.length) {
      return null;
    }
    return [...matching].sort((a, b) => {
      const franchiseA = data.franchises.find((franchise) => franchise.id === a.franchiseId);
      const franchiseB = data.franchises.find((franchise) => franchise.id === b.franchiseId);
      return new Date(franchiseA?.createdAt ?? 0).getTime() - new Date(franchiseB?.createdAt ?? 0).getTime();
    })[0].franchiseId;
  }

  private findFranchiseIdByTitleKeys(data: DataFile, keys: string[]) {
    if (!keys.length) {
      return null;
    }
    return data.franchises
      .filter((franchise) => titleKeysOverlap(keys, this.titleKeysForFranchise(data, franchise.id)))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]?.id ?? null;
  }

  private createAniListFranchise(data: DataFile, candidate: AniListImportCandidate, now: string) {
    const baseSlug = slugify(candidate.title) || `anilist-${candidate.anilistId}`;
    let slug = baseSlug;
    let suffix = 2;
    while (data.franchises.some((item) => item.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const franchiseId = randomUUID();
    data.franchises.push({
      id: franchiseId,
      slug,
      title: candidate.title,
      description: franchiseDescription(candidate),
      coverImage: nullableUrl(candidate.coverImage),
      bannerImage: nullableUrl(candidate.bannerImage),
      genres: candidate.genres,
      startYear: candidate.startYear,
      status: candidate.status,
      isCompleteAdaptation: false,
      createdAt: now,
      updatedAt: now
    });
    return franchiseId;
  }

  private ensureAniListCollection(data: DataFile, franchiseId: string, now: string) {
    const existing = data.collections.find((collection) => collection.franchiseId === franchiseId && collection.title === ANILIST_COLLECTION_TITLE);
    if (existing) {
      return existing.id;
    }
    const collectionId = randomUUID();
    data.collections.push({
      id: collectionId,
      franchiseId,
      title: ANILIST_COLLECTION_TITLE,
      description: "Raccoglitore creato automaticamente dalle relazioni AniList.",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    });
    return collectionId;
  }

  private mergeAniListFranchises(data: DataFile, targetFranchiseId: string, ids: number[], collectionId: string, titleKeys: string[]) {
    const idSet = new Set(ids);
    const duplicateFranchiseIds = new Set(
      data.works
        .filter((work) => work.franchiseId !== targetFranchiseId && typeof work.anilistId === "number" && idSet.has(work.anilistId))
        .map((work) => work.franchiseId)
    );
    for (const franchise of data.franchises) {
      if (franchise.id !== targetFranchiseId && titleKeysOverlap(titleKeys, this.titleKeysForFranchise(data, franchise.id))) {
        duplicateFranchiseIds.add(franchise.id);
      }
    }

    for (const work of data.works) {
      if (work.franchiseId === targetFranchiseId && typeof work.anilistId === "number" && idSet.has(work.anilistId)) {
        work.collectionId = collectionId;
        work.updatedAt = nowIso();
      }
      if (duplicateFranchiseIds.has(work.franchiseId)) {
        work.franchiseId = targetFranchiseId;
        work.collectionId = collectionId;
        work.updatedAt = nowIso();
      }
    }

    const libraryEntryIdsToRemove = new Set<string>();
    for (const entry of data.libraryEntries) {
      if (!duplicateFranchiseIds.has(entry.franchiseId)) {
        continue;
      }
      const existing = data.libraryEntries.find(
        (candidate) => candidate.userId === entry.userId && candidate.franchiseId === targetFranchiseId
      );
      if (existing) {
        existing.updatedAt = nowIso();
        libraryEntryIdsToRemove.add(entry.id);
      } else {
        entry.franchiseId = targetFranchiseId;
        entry.updatedAt = nowIso();
      }
    }
    data.libraryEntries = data.libraryEntries.filter((entry) => !libraryEntryIdsToRemove.has(entry.id));
    data.collections = data.collections.filter((collection) => !duplicateFranchiseIds.has(collection.franchiseId));
    data.franchises = data.franchises.filter((franchise) => !duplicateFranchiseIds.has(franchise.id));
  }

  private titleKeysForFranchise(data: DataFile, franchiseId: string) {
    const franchise = data.franchises.find((item) => item.id === franchiseId);
    const works = data.works.filter((work) => work.franchiseId === franchiseId);
    return animeTitleKeysForValues([
      franchise?.title,
      ...works.flatMap((work) => [work.title, work.titleRomaji, work.titleEnglish, work.titleNative])
    ]);
  }

  private addAniListWork(
    data: DataFile,
    franchiseId: string,
    collectionId: string,
    candidate: AniListImportCandidate,
    cap: number,
    sortOrder: number,
    now: string
  ) {
    const workId = randomUUID();
    data.works.push({
      id: workId,
      franchiseId,
      collectionId,
      title: candidate.title,
      titleRomaji: candidate.titleRomaji,
      titleEnglish: candidate.titleEnglish,
      titleNative: candidate.titleNative,
      description: candidate.description,
      coverImage: nullableUrl(candidate.coverImage),
      bannerImage: nullableUrl(candidate.bannerImage),
      genres: candidate.genres,
      startYear: candidate.startYear,
      format: candidate.format,
      status: candidate.status,
      duration: candidate.duration,
      episodeCount: candidate.episodeCount,
      anilistId: candidate.anilistId,
      malId: candidate.malId,
      sortOrder,
      createdAt: now,
      updatedAt: now
    });

    const episodes = episodeDrafts(candidate, cap);
    if (!episodes.length) {
      return;
    }
    const seasonId = randomUUID();
    data.seasons.push({
      id: seasonId,
      workId,
      title: seasonTitle(candidate),
      sortOrder: 0,
      episodeCount: candidate.format === "film" ? 1 : candidate.episodeCount,
      createdAt: now,
      updatedAt: now
    });
    data.episodes.push(
      ...episodes.map((episode) => ({
        id: randomUUID(),
        seasonId,
        title: episode.title,
        number: episode.number,
        duration: episode.duration,
        airedAt: episode.airedAt,
        createdAt: now,
        updatedAt: now
      }))
    );
  }

  private assertActiveUser(data: DataFile, userId: string) {
    const user = data.users.find((item) => item.id === userId);
    if (!user || !user.isActive) {
      throw new Error("Utente non trovato.");
    }
  }

  private areFriends(data: DataFile, userId: string, friendId: string) {
    const [userAId, userBId] = friendshipPair(userId, friendId);
    return data.friendships.some((friendship) => friendship.userAId === userAId && friendship.userBId === userBId);
  }

  private friendshipState(data: DataFile, viewerId: string, targetId: string): FriendshipState {
    if (viewerId === targetId) {
      return "self";
    }
    if (this.areFriends(data, viewerId, targetId)) {
      return "friends";
    }
    if (data.friendRequests.some((request) => request.requesterId === viewerId && request.addresseeId === targetId && request.status === "in_attesa")) {
      return "pending_sent";
    }
    if (data.friendRequests.some((request) => request.requesterId === targetId && request.addresseeId === viewerId && request.status === "in_attesa")) {
      return "pending_received";
    }
    return "none";
  }

  private friendshipsForUser(data: DataFile, userId: string): Friendship[] {
    return data.friendships
      .filter((friendship) => friendship.userAId === userId || friendship.userBId === userId)
      .map((friendship) => {
        const friendId = friendship.userAId === userId ? friendship.userBId : friendship.userAId;
        const friend = data.users.find((user) => user.id === friendId);
        if (!friend) {
          return null;
        }
        return {
          id: friendship.id,
          userId,
          friendId,
          friend: publicUser(friend),
          createdAt: friendship.createdAt
        };
      })
      .filter(Boolean) as Friendship[];
  }

  private friendRequest(data: DataFile, request: FriendRequest): FriendRequest {
    const requester = data.users.find((user) => user.id === request.requesterId);
    const addressee = data.users.find((user) => user.id === request.addresseeId);
    if (!requester || !addressee) {
      throw new Error("Richiesta amicizia non valida.");
    }
    return {
      ...request,
      requester: publicUser(requester),
      addressee: publicUser(addressee)
    };
  }

  private async acceptFriendRequest(data: DataFile, userId: string, requestId: string) {
    const request = data.friendRequests.find((item) => item.id === requestId);
    if (!request || request.addresseeId !== userId) {
      throw new Error("Richiesta amicizia non trovata.");
    }
    request.status = "accettata";
    request.updatedAt = nowIso();
    const [userAId, userBId] = friendshipPair(request.requesterId, request.addresseeId);
    if (!data.friendships.some((friendship) => friendship.userAId === userAId && friendship.userBId === userBId)) {
      data.friendships.push({ id: randomUUID(), userAId, userBId, createdAt: nowIso() });
    }
    await this.write(data);
    return this.friendRequest(data, request);
  }

  private privateMessage(data: DataFile, message: PrivateMessage): PrivateMessage {
    const sender = data.users.find((user) => user.id === message.senderId);
    const receiver = data.users.find((user) => user.id === message.receiverId);
    if (!sender || !receiver) {
      throw new Error("Messaggio privato non valido.");
    }
    return {
      ...message,
      sender: publicUser(sender),
      receiver: publicUser(receiver)
    };
  }

  private franchiseChatMessage(data: DataFile, message: FranchiseChatMessage): FranchiseChatMessage {
    const user = data.users.find((item) => item.id === message.userId);
    if (!user) {
      throw new Error("Messaggio franchise non valido.");
    }
    return {
      ...message,
      user: publicUser(user)
    };
  }

  private assertFranchise(data: DataFile, franchiseId: string) {
    if (!data.franchises.some((item) => item.id === franchiseId)) {
      throw new Error("Franchise non trovato.");
    }
  }

  private assertAdmin(data: DataFile, actorId: string) {
    const actor = data.users.find((item) => item.id === actorId);
    if (!actor || !adminRoles.includes(actor.role)) {
      throw new Error("Permesso negato.");
    }
  }

  private adminLog(data: DataFile, actorId: string, action: string, target: string, metadata?: Record<string, unknown>) {
    data.adminLogs.push({
      id: randomUUID(),
      actorId,
      action,
      target,
      metadata,
      createdAt: nowIso()
    });
    data.activities.push({
      id: randomUUID(),
      userId: actorId,
      kind: "admin_action",
      message: action,
      metadata: { target, ...metadata },
      createdAt: nowIso()
    });
  }

  private unlockAdminCreatedBadge(data: DataFile, userId: string) {
    const badge = data.badges.find((item) => item.conditionKind === "admin_created" && !item.ownerOnly);
    if (badge) {
      this.unlockBadge(data, userId, badge.id, "system");
    }
  }

  private unlockAutomaticBadges(data: DataFile, userId: string) {
    const completedEpisodes = data.episodeProgress.filter((row) => row.userId === userId && row.completed).length;
    const completedFranchises = data.libraryEntries.filter((entry) => entry.userId === userId && entry.state === "completato").length;
    const libraryCount = data.libraryEntries.filter((entry) => entry.userId === userId).length;
    const favoritesCount = data.libraryEntries.filter((entry) => entry.userId === userId && entry.favorite).length;
    const user = data.users.find((item) => item.id === userId);
    const profileCompleted = Boolean(user?.bio?.trim() && (user.avatarUrl || user.bannerUrl));
    for (const badge of data.badges) {
      if (badge.ownerOnly && user?.role !== "owner") {
        continue;
      }
      if (badge.conditionKind === "episodes_watched" && completedEpisodes >= (badge.conditionValue ?? 0)) {
        this.unlockBadge(data, userId, badge.id, "system");
      }
      if (badge.conditionKind === "franchises_completed" && completedFranchises >= (badge.conditionValue ?? 0)) {
        this.unlockBadge(data, userId, badge.id, "system");
      }
      if (badge.conditionKind === "library_count" && libraryCount >= (badge.conditionValue ?? 0)) {
        this.unlockBadge(data, userId, badge.id, "system");
      }
      if (badge.conditionKind === "favorites_count" && favoritesCount >= (badge.conditionValue ?? 0)) {
        this.unlockBadge(data, userId, badge.id, "system");
      }
      if (badge.conditionKind === "profile_completed" && profileCompleted) {
        this.unlockBadge(data, userId, badge.id, "system");
      }
    }
  }

  private unlockBadge(data: DataFile, userId: string, badgeId: string, assignedBy?: string | null) {
    const existing = data.userBadges.find((item) => item.userId === userId && item.badgeId === badgeId);
    if (existing) {
      return existing;
    }
    const badge = data.badges.find((item) => item.id === badgeId);
    if (!badge) {
      throw new Error("Badge non trovato.");
    }
    const user = data.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("Utente non trovato.");
    }
    if (badge.ownerOnly && user.role !== "owner") {
      throw new Error("Badge riservato all'owner.");
    }
    const userBadge: UserBadge = {
      id: randomUUID(),
      userId,
      badgeId,
      badge,
      unlockedAt: nowIso(),
      assignedBy,
      equippedSlot: null
    };
    data.userBadges.push(userBadge);
    data.activities.push({
      id: randomUUID(),
      userId,
      kind: "badge_unlocked",
      message: `Ha sbloccato il badge ${badge.name}.`,
      metadata: { badgeId },
      createdAt: nowIso()
    });
    return userBadge;
  }
}
