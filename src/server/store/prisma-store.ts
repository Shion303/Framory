import {
  ActivityKind as DbActivityKind,
  AnimeStatus as DbAnimeStatus,
  BadgeCategory as DbBadgeCategory,
  BadgeConditionKind as DbBadgeConditionKind,
  BadgeKind as DbBadgeKind,
  BadgeRarity as DbBadgeRarity,
  FriendRequestStatus as DbFriendRequestStatus,
  LibraryState as DbLibraryState,
  Prisma,
  PrismaClient,
  PrivacyLevel as DbPrivacyLevel,
  ReportStatus as DbReportStatus,
  Role as DbRole,
  WorkFormat as DbWorkFormat
} from "@/generated/prisma/client";
import { adminRoles } from "@/lib/constants";
import type {
  Activity,
  AnimeStatus,
  Badge,
  BadgeCategory,
  BadgeConditionKind,
  BadgeKind,
  BadgeRarity,
  EpisodeProgress,
  Franchise,
  FranchiseChatMessage,
  FranchiseFilters,
  FriendRequest,
  FriendRequestStatus,
  Friendship,
  FriendshipState,
  HomePayload,
  LibraryEntry,
  LibraryState,
  PrivateMessage,
  PrivacyLevel,
  PublicUser,
  Report,
  Role,
  UserBadge,
  WorkFormat
} from "@/lib/types";
import { clampScore, slugify } from "@/lib/format";
import type { AniListImportCandidate } from "@/server/anilist";
import { calculateProgress } from "@/server/progress";
import { createSessionToken, hashPassword, hashSessionToken, sessionExpiryDate, verifyPassword } from "@/server/security";
import { getPrismaClient } from "@/server/prisma";
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

type DbClient = InstanceType<typeof PrismaClient>;
type JsonRecord = Record<string, unknown> | null;

const roleToDb: Record<Role, keyof typeof DbRole> = {
  owner: "OWNER",
  admin: "ADMIN",
  moderator: "MODERATOR",
  user: "USER"
};

const roleFromDb: Record<keyof typeof DbRole, Role> = {
  OWNER: "owner",
  ADMIN: "admin",
  MODERATOR: "moderator",
  USER: "user"
};

const libraryToDb: Record<LibraryState, keyof typeof DbLibraryState> = {
  pianificato: "PLANNED",
  in_visione: "WATCHING",
  completato: "COMPLETED",
  in_pausa: "PAUSED",
  interrotto: "DROPPED"
};

const libraryFromDb: Record<keyof typeof DbLibraryState, LibraryState> = {
  PLANNED: "pianificato",
  WATCHING: "in_visione",
  COMPLETED: "completato",
  PAUSED: "in_pausa",
  DROPPED: "interrotto"
};

const statusToDb: Record<AnimeStatus, keyof typeof DbAnimeStatus> = {
  annunciato: "ANNOUNCED",
  in_corso: "RELEASING",
  concluso: "FINISHED",
  in_pausa: "HIATUS"
};

const statusFromDb: Record<keyof typeof DbAnimeStatus, AnimeStatus> = {
  ANNOUNCED: "annunciato",
  RELEASING: "in_corso",
  FINISHED: "concluso",
  HIATUS: "in_pausa"
};

const formatToDb: Record<WorkFormat, keyof typeof DbWorkFormat> = {
  tv: "TV",
  film: "MOVIE",
  ova: "OVA",
  ona: "ONA",
  special: "SPECIAL"
};

const formatFromDb: Record<keyof typeof DbWorkFormat, WorkFormat> = {
  TV: "tv",
  MOVIE: "film",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special"
};

const privacyToDb: Record<PrivacyLevel, keyof typeof DbPrivacyLevel> = {
  pubblico: "PUBLIC",
  follower: "FOLLOWERS",
  privato: "PRIVATE"
};

const privacyFromDb: Record<keyof typeof DbPrivacyLevel, PrivacyLevel> = {
  PUBLIC: "pubblico",
  FOLLOWERS: "follower",
  PRIVATE: "privato"
};

const rarityFromDb: Record<keyof typeof DbBadgeRarity, BadgeRarity> = {
  COMMON: "comune",
  RARE: "raro",
  EPIC: "epico",
  LEGENDARY: "leggendario"
};

const rarityToDb: Record<BadgeRarity, keyof typeof DbBadgeRarity> = {
  comune: "COMMON",
  raro: "RARE",
  epico: "EPIC",
  leggendario: "LEGENDARY"
};

const categoryFromDb: Record<keyof typeof DbBadgeCategory, BadgeCategory> = {
  TRACKING: "tracking",
  COLLECTION: "collezione",
  COMMUNITY: "community",
  SOCIAL: "social",
  EVENT: "evento",
  ADMIN: "admin"
};

const categoryToDb: Record<BadgeCategory, keyof typeof DbBadgeCategory> = {
  tracking: "TRACKING",
  collezione: "COLLECTION",
  community: "COMMUNITY",
  social: "SOCIAL",
  evento: "EVENT",
  admin: "ADMIN"
};

const kindFromDb: Record<keyof typeof DbBadgeKind, BadgeKind> = {
  STANDARD: "standard",
  MILESTONE: "milestone",
  EVENT: "evento",
  EXCLUSIVE: "esclusivo"
};

const kindToDb: Record<BadgeKind, keyof typeof DbBadgeKind> = {
  standard: "STANDARD",
  milestone: "MILESTONE",
  evento: "EVENT",
  esclusivo: "EXCLUSIVE"
};

const conditionFromDb: Record<keyof typeof DbBadgeConditionKind, BadgeConditionKind> = {
  EPISODES_WATCHED: "episodes_watched",
  FRANCHISES_COMPLETED: "franchises_completed",
  LIBRARY_COUNT: "library_count",
  FAVORITES_COUNT: "favorites_count",
  PROFILE_COMPLETED: "profile_completed",
  MANUAL: "manual",
  ADMIN_CREATED: "admin_created"
};

const conditionToDb: Record<BadgeConditionKind, keyof typeof DbBadgeConditionKind> = {
  episodes_watched: "EPISODES_WATCHED",
  franchises_completed: "FRANCHISES_COMPLETED",
  library_count: "LIBRARY_COUNT",
  favorites_count: "FAVORITES_COUNT",
  profile_completed: "PROFILE_COMPLETED",
  manual: "MANUAL",
  admin_created: "ADMIN_CREATED"
};

const activityFromDb: Record<keyof typeof DbActivityKind, Activity["kind"]> = {
  REGISTERED: "registered",
  LIBRARY_ADDED: "library_added",
  EPISODE_WATCHED: "episode_watched",
  BADGE_UNLOCKED: "badge_unlocked",
  BADGE_EQUIPPED: "badge_equipped",
  ADMIN_ACTION: "admin_action"
};

const reportFromDb: Record<keyof typeof DbReportStatus, Report["status"]> = {
  OPEN: "aperta",
  RESOLVED: "risolta",
  DISMISSED: "archiviata"
};

const reportToDb: Record<Report["status"], keyof typeof DbReportStatus> = {
  aperta: "OPEN",
  risolta: "RESOLVED",
  archiviata: "DISMISSED"
};

const friendRequestFromDb: Record<keyof typeof DbFriendRequestStatus, FriendRequestStatus> = {
  PENDING: "in_attesa",
  ACCEPTED: "accettata",
  DECLINED: "rifiutata"
};

const friendRequestToDb: Record<FriendRequestStatus, keyof typeof DbFriendRequestStatus> = {
  in_attesa: "PENDING",
  accettata: "ACCEPTED",
  rifiutata: "DECLINED"
};

const franchiseInclude = {
  collections: { orderBy: { sortOrder: "asc" as const } },
  works: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      seasons: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          episodes: { orderBy: { number: "asc" as const } }
        }
      }
    }
  }
};

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

function iso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function nullableUrl(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function friendshipPair(userId: string, friendId: string) {
  return [userId, friendId].sort() as [string, string];
}

export class PrismaStore implements FramoryStore {
  async ensureReady() {
    const db = await this.db();
    for (const badge of defaultBadges) {
      await db.badge.upsert({
        where: { slug: badge.slug },
        update: {},
        create: {
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          imageUrl: badge.imageUrl,
          rarity: rarityToDb[badge.rarity],
          category: categoryToDb[badge.category],
          kind: kindToDb[badge.kind],
          conditionKind: conditionToDb[badge.conditionKind],
          conditionValue: badge.conditionValue ?? null,
          ownerOnly: badge.ownerOnly
        }
      });
    }

    const ownerEmail = process.env.FRAMORY_OWNER_EMAIL?.trim().toLowerCase();
    const ownerPassword = process.env.FRAMORY_OWNER_PASSWORD;
    if (ownerEmail && ownerPassword) {
      await db.user.updateMany({
        where: { role: "OWNER", email: { not: ownerEmail } },
        data: { role: "ADMIN" }
      });
      const owner = await db.user.findUnique({ where: { email: ownerEmail } });
      if (owner) {
        const passwordChanged = !(await verifyPassword(ownerPassword, owner.passwordHash));
        await db.user.update({
          where: { id: owner.id },
          data: {
            role: "OWNER",
            isActive: true,
            ...(passwordChanged ? { passwordHash: await hashPassword(ownerPassword) } : {})
          }
        });
        if (passwordChanged) {
          await db.session.deleteMany({ where: { userId: owner.id } });
        }
      } else {
        await db.user.create({
          data: {
            email: ownerEmail,
            username: process.env.FRAMORY_OWNER_USERNAME ?? "owner",
            displayName: process.env.FRAMORY_OWNER_DISPLAY_NAME ?? "Owner Framory",
            passwordHash: await hashPassword(ownerPassword),
            role: "OWNER",
            bio: "Account owner generato da variabili ambiente."
          }
        });
      }
    }
  }

  async resetForTests() {
    throw new Error("Reset test non disponibile sullo storage Prisma.");
  }

  async createUser(input: CreateUserInput) {
    const db = await this.db();
    const user = await db.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        activities: {
          create: {
            kind: "REGISTERED",
            message: "Si è unito a Framory."
          }
        }
      }
    });
    return this.publicUser(user);
  }

  async getUserByEmail(email: string): Promise<UserWithPassword | null> {
    const user = await (await this.db()).user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? { ...this.publicUser(user), passwordHash: user.passwordHash } : null;
  }

  async getUserById(id: string) {
    const user = await (await this.db()).user.findUnique({ where: { id } });
    return user ? this.publicUser(user) : null;
  }

  async createSession(userId: string): Promise<SessionResult> {
    const token = createSessionToken();
    const expiresAt = sessionExpiryDate();
    await (await this.db()).session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt
      }
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async getUserBySessionToken(token: string) {
    const session = await (await this.db()).session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true }
    });
    if (!session || session.expiresAt.getTime() < Date.now() || !session.user.isActive) {
      return null;
    }
    return this.publicUser(session.user);
  }

  async deleteSession(token: string) {
    await (await this.db()).session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }

  async listFranchises(filters: FranchiseFilters = {}) {
    const db = await this.db();
    const pageSize = 12;
    const page = Math.max(1, filters.page ?? 1);
    const where = {
      ...(filters.genre ? { genres: { has: filters.genre } } : {}),
      ...(filters.year ? { startYear: filters.year } : {}),
      ...(filters.status ? { status: statusToDb[filters.status] } : {})
    };
    if (filters.query) {
      const rows = await db.franchise.findMany({
        where,
        include: franchiseInclude,
        orderBy: { title: "asc" }
      });
      const items = rows.map((row) => this.franchise(row)).filter((franchise) => franchiseMatchesQuery(franchise, filters.query as string));
      return paginateFranchises(sortFranchises(items, filters.sort), page, pageSize);
    }

    const orderBy =
      filters.sort === "year"
        ? { startYear: "desc" as const }
        : filters.sort === "recent"
          ? { createdAt: "desc" as const }
          : { title: "asc" as const };
    const [rows, total] = await Promise.all([
      db.franchise.findMany({
        where,
        include: franchiseInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      db.franchise.count({ where })
    ]);
    const items = rows.map((row) => this.franchise(row));
    if (filters.sort === "works") {
      items.sort((a, b) => b.works.length - a.works.length);
    }
    return { items, total, page, pageSize };
  }

  async listAniListWorkIds(limit = 12) {
    const rows = await (await this.db()).work.findMany({
      where: { anilistId: { not: null } },
      select: { anilistId: true },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, limit)
    });
    return rows.map((row) => row.anilistId).filter((id): id is number => typeof id === "number");
  }

  async getFranchiseBySlug(slug: string) {
    const row = await (await this.db()).franchise.findUnique({ where: { slug }, include: franchiseInclude });
    return row ? this.franchise(row) : null;
  }

  async getFranchiseById(id: string) {
    const row = await (await this.db()).franchise.findUnique({ where: { id }, include: franchiseInclude });
    return row ? this.franchise(row) : null;
  }

  async getFranchiseByWorkAniListId(anilistId: number) {
    const work = await (await this.db()).work.findUnique({ where: { anilistId }, select: { franchiseId: true } });
    return work ? this.getFranchiseById(work.franchiseId) : null;
  }

  async createFranchise(input: Parameters<FramoryStore["createFranchise"]>[0], actorId: string) {
    const db = await this.db();
    let slug = slugify(input.title);
    let suffix = 2;
    while (await db.franchise.findUnique({ where: { slug } })) {
      slug = `${slugify(input.title)}-${suffix}`;
      suffix += 1;
    }
    const row = await db.franchise.create({
      data: {
        slug,
        title: input.title,
        description: input.description,
        coverImage: nullableUrl(input.coverImage),
        bannerImage: nullableUrl(input.bannerImage),
        genres: input.genres,
        startYear: input.startYear ?? null,
        status: statusToDb[input.status],
        isCompleteAdaptation: input.isCompleteAdaptation
      },
      include: franchiseInclude
    });
    await this.adminLog(actorId, "Crea franchise", row.id, { title: row.title });
    await this.unlockAdminCreatedBadge(actorId);
    return this.franchise(row);
  }

  async updateFranchise(id: string, input: Parameters<FramoryStore["updateFranchise"]>[1], actorId: string) {
    const row = await (await this.db()).franchise.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.genres ? { genres: input.genres } : {}),
        ...(input.startYear !== undefined ? { startYear: input.startYear } : {}),
        ...(input.status ? { status: statusToDb[input.status] } : {}),
        ...(input.isCompleteAdaptation !== undefined ? { isCompleteAdaptation: input.isCompleteAdaptation } : {}),
        ...(input.coverImage !== undefined ? { coverImage: nullableUrl(input.coverImage) } : {}),
        ...(input.bannerImage !== undefined ? { bannerImage: nullableUrl(input.bannerImage) } : {})
      },
      include: franchiseInclude
    });
    await this.adminLog(actorId, "Aggiorna franchise", id, { title: row.title });
    return this.franchise(row);
  }

  async createCollection(input: Parameters<FramoryStore["createCollection"]>[0], actorId: string) {
    const db = await this.db();
    await db.collection.create({ data: input });
    await this.adminLog(actorId, "Crea collection", input.franchiseId, { title: input.title });
    return (await this.getFranchiseById(input.franchiseId)) as Franchise;
  }

  async createWork(input: Parameters<FramoryStore["createWork"]>[0], actorId: string) {
    const db = await this.db();
    if (input.anilistId) {
      const existing = await db.work.findUnique({ where: { anilistId: input.anilistId } });
      if (existing) {
        throw new Error("Opera già importata da AniList.");
      }
    }
    await db.work.create({
      data: {
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
        format: formatToDb[input.format],
        status: statusToDb[input.status],
        duration: input.duration ?? null,
        episodeCount: input.episodeCount ?? null,
        anilistId: input.anilistId ?? null,
        malId: input.malId ?? null,
        sortOrder: input.sortOrder
      }
    });
    await this.adminLog(actorId, "Crea work", input.franchiseId, { title: input.title });
    await this.unlockAdminCreatedBadge(actorId);
    return (await this.getFranchiseById(input.franchiseId)) as Franchise;
  }

  async autoImportAniListFranchises(candidates: AniListImportCandidate[], options?: { episodeCap?: number }) {
    const db = await this.db();
    const touched = new Set<string>();
    const cap = anilistEpisodeCap(options);

    for (const group of groupAniListCandidates(candidates)) {
      const titleKeys = group.candidates.flatMap((candidate) => animeTitleKeysForCandidate(candidate));
      let franchiseId = (await this.findFranchiseIdByAniListIds(db, group.ids)) ?? (await this.findFranchiseIdByTitleKeys(db, titleKeys));
      if (!franchiseId) {
        franchiseId = await this.createAniListFranchise(db, group.primary);
      }

      const collectionId = await this.ensureAniListCollection(db, franchiseId);
      await this.mergeAniListFranchises(db, franchiseId, group.ids, collectionId, titleKeys);

      let sortOrder = await db.work.count({ where: { franchiseId } });
      for (const candidate of group.candidates) {
        const existing = await db.work.findUnique({ where: { anilistId: candidate.anilistId } });
        if (existing) {
          continue;
        }
        await this.addAniListWork(db, franchiseId, collectionId, candidate, cap, sortOrder);
        sortOrder += 1;
      }
      touched.add(franchiseId);
    }

    const franchises = await Promise.all(Array.from(touched).map((franchiseId) => this.getFranchiseById(franchiseId)));
    return franchises.filter(Boolean) as Franchise[];
  }

  async createSeason(input: Parameters<FramoryStore["createSeason"]>[0], actorId: string) {
    const db = await this.db();
    const work = await db.work.findUnique({ where: { id: input.workId } });
    if (!work) {
      throw new Error("Work non trovato.");
    }
    await db.season.create({ data: input });
    await this.adminLog(actorId, "Crea season", work.franchiseId, { title: input.title });
    return (await this.getFranchiseById(work.franchiseId)) as Franchise;
  }

  async createEpisode(input: Parameters<FramoryStore["createEpisode"]>[0], actorId: string) {
    const db = await this.db();
    const season = await db.season.findUnique({ where: { id: input.seasonId }, include: { work: true } });
    if (!season) {
      throw new Error("Season non trovata.");
    }
    await db.episode.create({
      data: {
        seasonId: input.seasonId,
        title: input.title,
        number: input.number,
        duration: input.duration ?? null,
        airedAt: input.airedAt ? new Date(input.airedAt) : null
      }
    });
    await this.adminLog(actorId, "Crea episodio", season.work.franchiseId, { title: input.title, number: input.number });
    return (await this.getFranchiseById(season.work.franchiseId)) as Franchise;
  }

  async deleteFranchise(id: string, actorId: string) {
    await this.assertAdmin(actorId);
    await (await this.db()).franchise.delete({ where: { id } });
    await this.adminLog(actorId, "Elimina franchise", id);
  }

  async deleteWork(id: string, actorId: string) {
    await this.assertAdmin(actorId);
    await (await this.db()).work.delete({ where: { id } });
    await this.adminLog(actorId, "Elimina work", id);
  }

  async deleteSeason(id: string, actorId: string) {
    await this.assertAdmin(actorId);
    await (await this.db()).season.delete({ where: { id } });
    await this.adminLog(actorId, "Elimina season", id);
  }

  async deleteEpisode(id: string, actorId: string) {
    await this.assertAdmin(actorId);
    await (await this.db()).episode.delete({ where: { id } });
    await this.adminLog(actorId, "Elimina episodio", id);
  }

  async getLibrary(userId: string) {
    const rows = await (await this.db()).libraryEntry.findMany({
      where: { userId },
      include: { franchise: { include: franchiseInclude } },
      orderBy: { updatedAt: "desc" }
    });
    return Promise.all(rows.map((row) => this.libraryEntry(row, userId)));
  }

  async addToLibrary(userId: string, franchiseId: string) {
    const row = await (await this.db()).libraryEntry.upsert({
      where: { userId_franchiseId: { userId, franchiseId } },
      update: {},
      create: {
        userId,
        franchiseId,
        state: "PLANNED"
      },
      include: { franchise: { include: franchiseInclude } }
    });
    await (await this.db()).activity.create({
      data: {
        userId,
        kind: "LIBRARY_ADDED",
        message: "Ha aggiunto un franchise alla libreria.",
        metadata: { franchiseId }
      }
    });
    await this.unlockAutomaticBadges(userId);
    return this.libraryEntry(row, userId);
  }

  async updateLibrary(userId: string, franchiseId: string, input: Parameters<FramoryStore["updateLibrary"]>[2]) {
    const row = await (await this.db()).libraryEntry.update({
      where: { userId_franchiseId: { userId, franchiseId } },
      data: {
        ...(input.state ? { state: libraryToDb[input.state] } : {}),
        ...(input.score !== undefined ? { score: clampScore(input.score) } : {}),
        ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {})
      },
      include: { franchise: { include: franchiseInclude } }
    });
    await this.unlockAutomaticBadges(userId);
    return this.libraryEntry(row, userId);
  }

  async removeFromLibrary(userId: string, franchiseId: string) {
    await (await this.db()).libraryEntry.deleteMany({ where: { userId, franchiseId } });
  }

  async getProgressRows(userId: string, franchiseId: string) {
    const rows = await (await this.db()).episodeProgress.findMany({
      where: {
        userId,
        episode: {
          season: {
            work: { franchiseId }
          }
        }
      }
    });
    return rows.map((row) => this.progress(row));
  }

  async toggleEpisode(userId: string, episodeId: string, completed: boolean) {
    const db = await this.db();
    const episode = await db.episode.findUnique({
      where: { id: episodeId },
      include: { season: { include: { work: true } } }
    });
    if (!episode) {
      throw new Error("Episodio non trovato.");
    }
    const franchiseId = episode.season.work.franchiseId;
    const entry = await db.libraryEntry.findUnique({ where: { userId_franchiseId: { userId, franchiseId } } });
    if (!entry) {
      throw new Error("Aggiungi il franchise alla libreria prima di tracciare gli episodi.");
    }
    await db.episodeProgress.upsert({
      where: { userId_episodeId: { userId, episodeId } },
      update: {
        completed,
        watchedAt: completed ? new Date() : null
      },
      create: {
        userId,
        episodeId,
        completed,
        watchedAt: completed ? new Date() : null
      }
    });
    if (completed) {
      await db.activity.create({
        data: {
          userId,
          kind: "EPISODE_WATCHED",
          message: `Ha completato l'episodio ${episode.number}.`,
          metadata: { episodeId, franchiseId }
        }
      });
    }
    const franchise = (await this.getFranchiseById(franchiseId)) as Franchise;
    const progress = calculateProgress(franchise, await this.getProgressRows(userId, franchiseId));
    const updated = await db.libraryEntry.update({
      where: { userId_franchiseId: { userId, franchiseId } },
      data: {
        state: progress.totalEpisodes > 0 && progress.completedEpisodes === progress.totalEpisodes ? "COMPLETED" : "WATCHING"
      },
      include: { franchise: { include: franchiseInclude } }
    });
    await this.unlockAutomaticBadges(userId);
    return this.libraryEntry(updated, userId);
  }

  async getHome(userId?: string | null): Promise<HomePayload> {
    const user = userId ? await this.getUserById(userId) : null;
    const library = userId ? await this.getLibrary(userId) : [];
    const completedEpisodes = userId
      ? await (await this.db()).episodeProgress.count({ where: { userId, completed: true } })
      : 0;
    const recentFranchises = (await this.listFranchises({ sort: "recent" })).items.slice(0, 6);
    const favoriteGenres = new Set(
      library
        .filter((entry) => entry.favorite)
        .flatMap((entry) => entry.franchise?.genres ?? [])
        .map((genre) => genre.toLowerCase())
    );
    return {
      user,
      stats: {
        libraryCount: library.length,
        completedEpisodes,
        completedFranchises: library.filter((entry) => entry.state === "completato").length,
        badges: userId ? await (await this.db()).userBadge.count({ where: { userId } }) : 0
      },
      nextEpisode: library.map((entry) => entry.progress?.nextEpisode).find(Boolean),
      trending: (await this.listFranchises({ sort: "works" })).items.slice(0, 6),
      recentFranchises,
      activities: await this.activities(),
      recommendations: favoriteGenres.size
        ? recentFranchises.filter((franchise) => franchise.genres.some((genre) => favoriteGenres.has(genre.toLowerCase())))
        : recentFranchises.slice(0, 3)
    };
  }

  async listBadges(userId?: string) {
    const db = await this.db();
    if (userId) {
      await this.unlockAutomaticBadges(userId);
    }
    const [badges, userBadges] = await Promise.all([
      db.badge.findMany({ orderBy: { name: "asc" } }),
      userId ? db.userBadge.findMany({ where: { userId }, include: { badge: true } }) : []
    ]);
    return {
      badges: badges.map((badge) => this.badge(badge)),
      userBadges: userBadges.map((badge) => this.userBadge(badge))
    };
  }

  async createBadge(actorId: string, input: Parameters<FramoryStore["createBadge"]>[1]) {
    await this.assertAdmin(actorId);
    const db = await this.db();
    const existing = await db.badge.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new Error("Esiste gia un badge con questo slug.");
    }
    const row = await db.badge.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description,
        imageUrl: nullableUrl(input.imageUrl),
        rarity: rarityToDb[input.rarity],
        category: categoryToDb[input.category],
        kind: kindToDb[input.kind ?? "standard"],
        conditionKind: conditionToDb[input.conditionKind],
        conditionValue: input.conditionValue ?? null,
        ownerOnly: input.ownerOnly ?? false
      }
    });
    await this.adminLog(actorId, "Crea badge", row.id, { slug: row.slug, name: row.name });
    return this.badge(row);
  }

  async updateBadge(actorId: string, badgeId: string, input: Parameters<FramoryStore["updateBadge"]>[2]) {
    await this.assertAdmin(actorId);
    const db = await this.db();
    const current = await db.badge.findUnique({ where: { id: badgeId } });
    if (!current) {
      throw new Error("Badge non trovato.");
    }
    if (input.slug) {
      const existing = await db.badge.findUnique({ where: { slug: input.slug } });
      if (existing && existing.id !== badgeId) {
        throw new Error("Esiste gia un badge con questo slug.");
      }
    }
    const row = await db.badge.update({
      where: { id: badgeId },
      data: {
        ...(input.slug ? { slug: input.slug } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: nullableUrl(input.imageUrl) } : {}),
        ...(input.rarity ? { rarity: rarityToDb[input.rarity] } : {}),
        ...(input.category ? { category: categoryToDb[input.category] } : {}),
        ...(input.kind ? { kind: kindToDb[input.kind] } : {}),
        ...(input.conditionKind ? { conditionKind: conditionToDb[input.conditionKind] } : {}),
        ...(input.conditionValue !== undefined ? { conditionValue: input.conditionValue } : {}),
        ...(input.ownerOnly !== undefined ? { ownerOnly: input.ownerOnly } : {})
      }
    });
    if (row.ownerOnly) {
      await db.userBadge.deleteMany({ where: { badgeId, user: { role: { not: "OWNER" } } } });
    }
    await this.adminLog(actorId, "Aggiorna badge", row.id, { slug: row.slug, name: row.name });
    return this.badge(row);
  }

  async deleteBadge(actorId: string, badgeId: string) {
    await this.assertAdmin(actorId);
    const db = await this.db();
    const badge = await db.badge.findUnique({ where: { id: badgeId } });
    if (!badge) {
      throw new Error("Badge non trovato.");
    }
    await db.userBadge.deleteMany({ where: { badgeId } });
    await db.badge.delete({ where: { id: badgeId } });
    await this.adminLog(actorId, "Elimina badge", badgeId, { slug: badge.slug, name: badge.name });
  }

  async equipBadge(userId: string, badgeId: string, slot: number) {
    if (slot < 1 || slot > 3) {
      throw new Error("Puoi equipaggiare badge solo negli slot 1, 2 o 3.");
    }
    const db = await this.db();
    const owned = await db.userBadge.findUnique({ where: { userId_badgeId: { userId, badgeId } } });
    if (!owned) {
      throw new Error("Badge non ancora sbloccato.");
    }
    await db.userBadge.updateMany({
      where: { userId, OR: [{ equippedSlot: slot }, { badgeId }] },
      data: { equippedSlot: null }
    });
    await db.userBadge.update({ where: { userId_badgeId: { userId, badgeId } }, data: { equippedSlot: slot } });
    await db.activity.create({
      data: {
        userId,
        kind: "BADGE_EQUIPPED",
        message: "Ha equipaggiato un badge.",
        metadata: { badgeId, slot }
      }
    });
    return (await db.userBadge.findMany({ where: { userId }, include: { badge: true } })).map((badge) => this.userBadge(badge));
  }

  async grantBadge(actorId: string, userId: string, badgeId: string) {
    await this.assertAdmin(actorId);
    const badge = await this.unlockBadge(userId, badgeId, actorId);
    await this.adminLog(actorId, "Assegna badge", userId, { badgeId });
    return badge;
  }

  async updateProfile(userId: string, input: Parameters<FramoryStore["updateProfile"]>[1]) {
    const user = await (await this.db()).user.update({
      where: { id: userId },
      data: {
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: nullableUrl(input.avatarUrl) } : {}),
        ...(input.bannerUrl !== undefined ? { bannerUrl: nullableUrl(input.bannerUrl) } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.profilePrivacy ? { profilePrivacy: privacyToDb[input.profilePrivacy] } : {}),
        ...(input.libraryPrivacy ? { libraryPrivacy: privacyToDb[input.libraryPrivacy] } : {}),
        ...(input.progressPrivacy ? { progressPrivacy: privacyToDb[input.progressPrivacy] } : {}),
        ...(input.activityPrivacy ? { activityPrivacy: privacyToDb[input.activityPrivacy] } : {})
      }
    });
    await this.unlockAutomaticBadges(userId);
    return this.publicUser(user);
  }

  async getPublicProfile(username: string, viewerId?: string | null) {
    const db = await this.db();
    const user = await db.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      return null;
    }
    const viewer = viewerId ? await db.user.findUnique({ where: { id: viewerId } }) : null;
    const safeUser = this.publicUser(user);
    const canSeePrivate = viewer?.id === user.id || (viewer ? adminRoles.includes(roleFromDb[viewer.role]) : false);
    if (safeUser.profilePrivacy === "privato" && !canSeePrivate) {
      return { user: safeUser, library: [], badges: [], activities: [] };
    }
    return {
      user: safeUser,
      library: safeUser.libraryPrivacy === "privato" && !canSeePrivate ? [] : await this.getLibrary(user.id),
      badges: (await db.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } })).map((badge) => this.userBadge(badge)),
      activities:
        safeUser.activityPrivacy === "privato" && !canSeePrivate
          ? []
          : (await db.activity.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 })).map((activity) =>
              this.activity(activity)
            )
    };
  }

  async createReport(userId: string, input: { targetType: string; targetId: string; reason: string }) {
    const row = await (await this.db()).report.create({
      data: {
        reporterId: userId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason
      }
    });
    return this.report(row);
  }

  async updateReport(actorId: string, reportId: string, status: Report["status"]) {
    const actor = await (await this.db()).user.findUnique({ where: { id: actorId } });
    if (!actor || !["OWNER", "ADMIN", "MODERATOR"].includes(actor.role)) {
      throw new Error("Permesso moderazione richiesto.");
    }
    const row = await (await this.db()).report.update({
      where: { id: reportId },
      data: {
        status: reportToDb[status],
        moderatorId: actorId
      }
    });
    await this.adminLog(actorId, "Aggiorna segnalazione", reportId, { status });
    return this.report(row);
  }

  async getMaintenanceMode() {
    const setting = await (await this.db()).platformSetting.findUnique({ where: { key: "maintenanceMode" } });
    return Boolean(setting?.value);
  }

  async setMaintenanceMode(actorId: string, enabled: boolean) {
    await this.assertAdmin(actorId);
    await (await this.db()).platformSetting.upsert({
      where: { key: "maintenanceMode" },
      update: { value: enabled },
      create: { key: "maintenanceMode", value: enabled }
    });
    await this.adminLog(actorId, "Aggiorna manutenzione", "platform", { enabled });
    return enabled;
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    const db = await this.db();
    const [users, reports, franchises, badges] = await Promise.all([
      db.user.findMany({ orderBy: { createdAt: "desc" } }),
      db.report.findMany({ orderBy: { createdAt: "desc" } }),
      db.franchise.findMany({ include: franchiseInclude, orderBy: { createdAt: "desc" } }),
      db.badge.findMany({ orderBy: { name: "asc" } })
    ]);
    return {
      users: users.map((user) => this.publicUser(user)),
      reports: reports.map((report) => this.report(report)),
      activities: await this.activities(40),
      franchises: franchises.map((franchise) => this.franchise(franchise)),
      badges: badges.map((badge) => this.badge(badge))
    };
  }

  async updateUser(actorId: string, userId: string, input: Parameters<FramoryStore["updateUser"]>[2]) {
    const db = await this.db();
    const actor = await db.user.findUnique({ where: { id: actorId } });
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!actor || !target) {
      throw new Error("Utente non trovato.");
    }
    if (target.role === "OWNER" && actor.id !== target.id) {
      throw new Error("L'owner non può essere modificato da altri account.");
    }
    if (input.role && actor.role !== "OWNER") {
      throw new Error("Solo l'owner può modificare i ruoli.");
    }
    const user = await db.user.update({
      where: { id: userId },
      data: {
        ...(input.role ? { role: roleToDb[input.role] } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      }
    });
    await this.adminLog(actorId, "Aggiorna utente", userId, input);
    return this.publicUser(user);
  }

  async searchUsers(viewerId: string, query: string) {
    const db = await this.db();
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) {
      return [];
    }
    const [users, friendships, requests] = await Promise.all([
      db.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, take: 100 }),
      db.friendship.findMany({ where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] } }),
      db.friendRequest.findMany({
        where: {
          status: "PENDING",
          OR: [{ requesterId: viewerId }, { addresseeId: viewerId }]
        }
      })
    ]);
    return users
      .filter((user) => user.displayName.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((user) => ({
        ...this.publicUser(user),
        friendship: this.friendshipStateFromRows(viewerId, user.id, friendships, requests)
      }));
  }

  async getSocialSummary(userId: string) {
    const db = await this.db();
    const [friendships, incoming, outgoing] = await Promise.all([
      db.friendship.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: { userA: true, userB: true },
        orderBy: { createdAt: "desc" }
      }),
      db.friendRequest.findMany({
        where: { addresseeId: userId, status: "PENDING" },
        include: { requester: true, addressee: true },
        orderBy: { createdAt: "desc" }
      }),
      db.friendRequest.findMany({
        where: { requesterId: userId, status: "PENDING" },
        include: { requester: true, addressee: true },
        orderBy: { createdAt: "desc" }
      })
    ]);
    return {
      friends: friendships.map((friendship) => this.friendship(friendship, userId)),
      incoming: incoming.map((request) => this.friendRequest(request)),
      outgoing: outgoing.map((request) => this.friendRequest(request))
    };
  }

  async sendFriendRequest(userId: string, targetId: string) {
    if (userId === targetId) {
      throw new Error("Non puoi inviare una richiesta a te stesso.");
    }
    const db = await this.db();
    const [user, target] = await Promise.all([db.user.findUnique({ where: { id: userId } }), db.user.findUnique({ where: { id: targetId } })]);
    if (!user?.isActive || !target?.isActive) {
      throw new Error("Utente non trovato.");
    }
    if (await this.areFriends(userId, targetId)) {
      throw new Error("Siete gia amici.");
    }
    const reverse = await db.friendRequest.findUnique({ where: { requesterId_addresseeId: { requesterId: targetId, addresseeId: userId } } });
    if (reverse?.status === "PENDING") {
      return this.acceptFriendRequest(userId, reverse.id);
    }
    const row = await db.friendRequest.upsert({
      where: { requesterId_addresseeId: { requesterId: userId, addresseeId: targetId } },
      update: { status: friendRequestToDb.in_attesa },
      create: { requesterId: userId, addresseeId: targetId },
      include: { requester: true, addressee: true }
    });
    return this.friendRequest(row);
  }

  async respondFriendRequest(userId: string, requestId: string, action: "accept" | "decline") {
    if (action === "accept") {
      return this.acceptFriendRequest(userId, requestId);
    }
    const db = await this.db();
    const existing = await db.friendRequest.findUnique({ where: { id: requestId } });
    if (!existing || existing.addresseeId !== userId) {
      throw new Error("Richiesta amicizia non trovata.");
    }
    const row = await db.friendRequest.update({
      where: { id: requestId },
      data: { status: friendRequestToDb.rifiutata },
      include: { requester: true, addressee: true }
    });
    return this.friendRequest(row);
  }

  async removeFriend(userId: string, friendId: string) {
    const [userAId, userBId] = friendshipPair(userId, friendId);
    await (await this.db()).friendship.deleteMany({ where: { userAId, userBId } });
  }

  async getPrivateMessages(userId: string, friendId: string) {
    if (!(await this.areFriends(userId, friendId))) {
      throw new Error("Puoi leggere messaggi privati solo con gli amici.");
    }
    const rows = await (await this.db()).privateMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId }
        ]
      },
      include: { sender: true, receiver: true },
      orderBy: { createdAt: "desc" },
      take: 80
    });
    return rows.reverse().map((message) => this.privateMessage(message));
  }

  async sendPrivateMessage(userId: string, friendId: string, body: string) {
    if (!(await this.areFriends(userId, friendId))) {
      throw new Error("Puoi inviare messaggi privati solo agli amici.");
    }
    const text = body.trim();
    if (!text) {
      throw new Error("Messaggio vuoto.");
    }
    const row = await (await this.db()).privateMessage.create({
      data: { senderId: userId, receiverId: friendId, body: text.slice(0, 1000) },
      include: { sender: true, receiver: true }
    });
    return this.privateMessage(row);
  }

  async getFranchiseChat(_userId: string, franchiseId: string) {
    const db = await this.db();
    const franchise = await db.franchise.findUnique({ where: { id: franchiseId }, select: { id: true } });
    if (!franchise) {
      throw new Error("Franchise non trovato.");
    }
    const rows = await db.franchiseChatMessage.findMany({
      where: { franchiseId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return rows.reverse().map((message) => this.franchiseChatMessage(message));
  }

  async sendFranchiseChatMessage(userId: string, franchiseId: string, body: string) {
    const db = await this.db();
    const text = body.trim();
    if (!text) {
      throw new Error("Messaggio vuoto.");
    }
    const [user, franchise] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } }),
      db.franchise.findUnique({ where: { id: franchiseId }, select: { id: true } })
    ]);
    if (!user?.isActive || !franchise) {
      throw new Error("Permesso negato.");
    }
    const row = await db.franchiseChatMessage.create({
      data: { userId, franchiseId, body: text.slice(0, 1000) },
      include: { user: true }
    });
    return this.franchiseChatMessage(row);
  }

  private async db() {
    return (await getPrismaClient()) as DbClient;
  }

  private async areFriends(userId: string, friendId: string) {
    const [userAId, userBId] = friendshipPair(userId, friendId);
    return Boolean(await (await this.db()).friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } }));
  }

  private async acceptFriendRequest(userId: string, requestId: string) {
    const db = await this.db();
    const request = await db.friendRequest.findUnique({ where: { id: requestId } });
    if (!request || request.addresseeId !== userId) {
      throw new Error("Richiesta amicizia non trovata.");
    }
    const [userAId, userBId] = friendshipPair(request.requesterId, request.addresseeId);
    await db.friendship.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {},
      create: { userAId, userBId }
    });
    const row = await db.friendRequest.update({
      where: { id: requestId },
      data: { status: friendRequestToDb.accettata },
      include: { requester: true, addressee: true }
    });
    return this.friendRequest(row);
  }

  private friendshipStateFromRows(
    viewerId: string,
    targetId: string,
    friendships: Array<{ userAId: string; userBId: string }>,
    requests: Array<{ requesterId: string; addresseeId: string }>
  ): FriendshipState {
    if (viewerId === targetId) {
      return "self";
    }
    const [userAId, userBId] = friendshipPair(viewerId, targetId);
    if (friendships.some((friendship) => friendship.userAId === userAId && friendship.userBId === userBId)) {
      return "friends";
    }
    if (requests.some((request) => request.requesterId === viewerId && request.addresseeId === targetId)) {
      return "pending_sent";
    }
    if (requests.some((request) => request.requesterId === targetId && request.addresseeId === viewerId)) {
      return "pending_received";
    }
    return "none";
  }

  private async findFranchiseIdByAniListIds(db: DbClient, ids: number[]) {
    const rows = await db.work.findMany({
      where: { anilistId: { in: ids } },
      select: { franchiseId: true, franchise: { select: { createdAt: true } } }
    });
    return rows.sort((a, b) => a.franchise.createdAt.getTime() - b.franchise.createdAt.getTime())[0]?.franchiseId ?? null;
  }

  private async findFranchiseIdByTitleKeys(db: DbClient, keys: string[]) {
    if (!keys.length) {
      return null;
    }
    const rows = await db.franchise.findMany({
      include: { works: { select: { title: true, titleRomaji: true, titleEnglish: true, titleNative: true } } },
      orderBy: { createdAt: "asc" }
    });
    return rows.find((row) => titleKeysOverlap(keys, this.titleKeysForFranchiseRow(row)))?.id ?? null;
  }

  private async createAniListFranchise(db: DbClient, candidate: AniListImportCandidate) {
    const baseSlug = slugify(candidate.title) || `anilist-${candidate.anilistId}`;
    let slug = baseSlug;
    let suffix = 2;
    while (await db.franchise.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const row = await db.franchise.create({
      data: {
        slug,
        title: candidate.title,
        description: franchiseDescription(candidate),
        coverImage: nullableUrl(candidate.coverImage),
        bannerImage: nullableUrl(candidate.bannerImage),
        genres: candidate.genres,
        startYear: candidate.startYear,
        status: statusToDb[candidate.status],
        isCompleteAdaptation: false
      },
      select: { id: true }
    });
    return row.id;
  }

  private async ensureAniListCollection(db: DbClient, franchiseId: string) {
    const existing = await db.collection.findFirst({ where: { franchiseId, title: ANILIST_COLLECTION_TITLE }, select: { id: true } });
    if (existing) {
      return existing.id;
    }
    const row = await db.collection.create({
      data: {
        franchiseId,
        title: ANILIST_COLLECTION_TITLE,
        description: "Raccoglitore creato automaticamente dalle relazioni AniList.",
        sortOrder: 0
      },
      select: { id: true }
    });
    return row.id;
  }

  private async mergeAniListFranchises(db: DbClient, targetFranchiseId: string, ids: number[], collectionId: string, titleKeys: string[]) {
    await db.work.updateMany({
      where: { franchiseId: targetFranchiseId, anilistId: { in: ids } },
      data: { collectionId }
    });

    const duplicates = await db.work.findMany({
      where: { franchiseId: { not: targetFranchiseId }, anilistId: { in: ids } },
      select: { franchiseId: true }
    });
    const duplicateFranchiseIds = new Set(duplicates.map((work) => work.franchiseId));
    const titleMatches = await db.franchise.findMany({
      where: { id: { not: targetFranchiseId } },
      include: { works: { select: { title: true, titleRomaji: true, titleEnglish: true, titleNative: true } } }
    });
    for (const row of titleMatches) {
      if (titleKeysOverlap(titleKeys, this.titleKeysForFranchiseRow(row))) {
        duplicateFranchiseIds.add(row.id);
      }
    }
    const duplicateIds = Array.from(duplicateFranchiseIds);
    if (!duplicateIds.length) {
      return;
    }

    const libraryEntries = await db.libraryEntry.findMany({ where: { franchiseId: { in: duplicateIds } } });
    for (const entry of libraryEntries) {
      const existing = await db.libraryEntry.findUnique({
        where: { userId_franchiseId: { userId: entry.userId, franchiseId: targetFranchiseId } }
      });
      if (existing) {
        await db.libraryEntry.delete({ where: { id: entry.id } });
      } else {
        await db.libraryEntry.update({ where: { id: entry.id }, data: { franchiseId: targetFranchiseId } });
      }
    }

    await db.work.updateMany({
      where: { franchiseId: { in: duplicateIds } },
      data: { franchiseId: targetFranchiseId, collectionId }
    });
    await db.franchise.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  private titleKeysForFranchiseRow(row: {
    title: string;
    works: Array<{ title: string; titleRomaji: string | null; titleEnglish: string | null; titleNative: string | null }>;
  }) {
    return animeTitleKeysForValues([
      row.title,
      ...row.works.flatMap((work) => [work.title, work.titleRomaji, work.titleEnglish, work.titleNative])
    ]);
  }

  private async addAniListWork(
    db: DbClient,
    franchiseId: string,
    collectionId: string,
    candidate: AniListImportCandidate,
    cap: number,
    sortOrder: number
  ) {
    const episodes = episodeDrafts(candidate, cap);
    await db.work.create({
      data: {
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
        format: formatToDb[candidate.format],
        status: statusToDb[candidate.status],
        duration: candidate.duration,
        episodeCount: candidate.episodeCount,
        anilistId: candidate.anilistId,
        malId: candidate.malId,
        sortOrder,
        ...(episodes.length
          ? {
              seasons: {
                create: {
                  title: seasonTitle(candidate),
                  sortOrder: 0,
                  episodeCount: candidate.format === "film" ? 1 : candidate.episodeCount,
                  episodes: {
                    create: episodes
                  }
                }
              }
            }
          : {})
      }
    });
  }

  private publicUser(user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    role: keyof typeof DbRole;
    isActive: boolean;
    avatarUrl: string | null;
    bannerUrl: string | null;
    bio: string | null;
    profilePrivacy: keyof typeof DbPrivacyLevel;
    libraryPrivacy: keyof typeof DbPrivacyLevel;
    progressPrivacy: keyof typeof DbPrivacyLevel;
    activityPrivacy: keyof typeof DbPrivacyLevel;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: roleFromDb[user.role],
      isActive: user.isActive,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      bio: user.bio,
      profilePrivacy: privacyFromDb[user.profilePrivacy],
      libraryPrivacy: privacyFromDb[user.libraryPrivacy],
      progressPrivacy: privacyFromDb[user.progressPrivacy],
      activityPrivacy: privacyFromDb[user.activityPrivacy],
      createdAt: user.createdAt.toISOString()
    };
  }

  private franchise(row: {
    id: string;
    slug: string;
    title: string;
    description: string;
    coverImage: string | null;
    bannerImage: string | null;
    genres: string[];
    startYear: number | null;
    status: keyof typeof DbAnimeStatus;
    isCompleteAdaptation: boolean;
    createdAt: Date;
    updatedAt: Date;
    collections: Array<{
      id: string;
      franchiseId: string;
      title: string;
      description: string | null;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
    works: Array<{
      id: string;
      franchiseId: string;
      collectionId: string | null;
      title: string;
      titleRomaji: string | null;
      titleEnglish: string | null;
      titleNative: string | null;
      description: string | null;
      coverImage: string | null;
      bannerImage: string | null;
      genres: string[];
      startYear: number | null;
      format: keyof typeof DbWorkFormat;
      status: keyof typeof DbAnimeStatus;
      duration: number | null;
      episodeCount: number | null;
      anilistId: number | null;
      malId: number | null;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
      seasons: Array<{
        id: string;
        workId: string;
        title: string;
        sortOrder: number;
        episodeCount: number | null;
        createdAt: Date;
        updatedAt: Date;
        episodes: Array<{
          id: string;
          seasonId: string;
          title: string;
          number: number;
          duration: number | null;
          airedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
        }>;
      }>;
    }>;
  }): Franchise {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      coverImage: row.coverImage,
      bannerImage: row.bannerImage,
      genres: row.genres,
      startYear: row.startYear,
      status: statusFromDb[row.status],
      isCompleteAdaptation: row.isCompleteAdaptation,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      collections: row.collections.map((collection) => ({
        ...collection,
        createdAt: collection.createdAt.toISOString(),
        updatedAt: collection.updatedAt.toISOString()
      })),
      works: row.works.map((work) => ({
        id: work.id,
        franchiseId: work.franchiseId,
        collectionId: work.collectionId,
        title: work.title,
        titleRomaji: work.titleRomaji,
        titleEnglish: work.titleEnglish,
        titleNative: work.titleNative,
        description: work.description,
        coverImage: work.coverImage,
        bannerImage: work.bannerImage,
        genres: work.genres,
        startYear: work.startYear,
        format: formatFromDb[work.format],
        status: statusFromDb[work.status],
        duration: work.duration,
        episodeCount: work.episodeCount,
        anilistId: work.anilistId,
        malId: work.malId,
        sortOrder: work.sortOrder,
        createdAt: work.createdAt.toISOString(),
        updatedAt: work.updatedAt.toISOString(),
        seasons: work.seasons.map((season) => ({
          id: season.id,
          workId: season.workId,
          title: season.title,
          sortOrder: season.sortOrder,
          episodeCount: season.episodeCount,
          createdAt: season.createdAt.toISOString(),
          updatedAt: season.updatedAt.toISOString(),
          episodes: season.episodes.map((episode) => ({
            id: episode.id,
            seasonId: episode.seasonId,
            title: episode.title,
            number: episode.number,
            duration: episode.duration,
            airedAt: iso(episode.airedAt),
            createdAt: episode.createdAt.toISOString(),
            updatedAt: episode.updatedAt.toISOString()
          }))
        }))
      }))
    };
  }

  private async libraryEntry(
    row: {
      id: string;
      userId: string;
      franchiseId: string;
      state: keyof typeof DbLibraryState;
      score: number | null;
      favorite: boolean;
      notes: string | null;
      addedAt: Date;
      updatedAt: Date;
      franchise: Parameters<PrismaStore["franchise"]>[0];
    },
    userId: string
  ): Promise<LibraryEntry> {
    const franchise = this.franchise(row.franchise);
    const progress = calculateProgress(franchise, await this.getProgressRows(userId, row.franchiseId));
    return {
      id: row.id,
      userId: row.userId,
      franchiseId: row.franchiseId,
      state: libraryFromDb[row.state],
      score: row.score,
      favorite: row.favorite,
      notes: row.notes,
      addedAt: row.addedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      franchise,
      progress
    };
  }

  private progress(row: {
    id: string;
    userId: string;
    episodeId: string;
    completed: boolean;
    watchedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): EpisodeProgress {
    return {
      id: row.id,
      userId: row.userId,
      episodeId: row.episodeId,
      completed: row.completed,
      watchedAt: iso(row.watchedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private badge(row: {
    id: string;
    slug: string;
    name: string;
    description: string;
    imageUrl: string | null;
    rarity: keyof typeof DbBadgeRarity;
    category: keyof typeof DbBadgeCategory;
    kind: keyof typeof DbBadgeKind;
    conditionKind: keyof typeof DbBadgeConditionKind;
    conditionValue: number | null;
    ownerOnly: boolean;
  }): Badge {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      rarity: rarityFromDb[row.rarity],
      category: categoryFromDb[row.category],
      kind: kindFromDb[row.kind],
      conditionKind: conditionFromDb[row.conditionKind],
      conditionValue: row.conditionValue,
      ownerOnly: row.ownerOnly
    };
  }

  private userBadge(row: {
    id: string;
    userId: string;
    badgeId: string;
    badge: Parameters<PrismaStore["badge"]>[0];
    unlockedAt: Date;
    assignedBy: string | null;
    equippedSlot: number | null;
  }): UserBadge {
    return {
      id: row.id,
      userId: row.userId,
      badgeId: row.badgeId,
      badge: this.badge(row.badge),
      unlockedAt: row.unlockedAt.toISOString(),
      assignedBy: row.assignedBy,
      equippedSlot: row.equippedSlot
    };
  }

  private friendRequest(row: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: keyof typeof DbFriendRequestStatus;
    requester: Parameters<PrismaStore["publicUser"]>[0];
    addressee: Parameters<PrismaStore["publicUser"]>[0];
    createdAt: Date;
    updatedAt: Date;
  }): FriendRequest {
    return {
      id: row.id,
      requesterId: row.requesterId,
      addresseeId: row.addresseeId,
      status: friendRequestFromDb[row.status],
      requester: this.publicUser(row.requester),
      addressee: this.publicUser(row.addressee),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private friendship(
    row: {
      id: string;
      userAId: string;
      userBId: string;
      userA: Parameters<PrismaStore["publicUser"]>[0];
      userB: Parameters<PrismaStore["publicUser"]>[0];
      createdAt: Date;
    },
    userId: string
  ): Friendship {
    const friendId = row.userAId === userId ? row.userBId : row.userAId;
    const friend = row.userAId === userId ? row.userB : row.userA;
    return {
      id: row.id,
      userId,
      friendId,
      friend: this.publicUser(friend),
      createdAt: row.createdAt.toISOString()
    };
  }

  private privateMessage(row: {
    id: string;
    senderId: string;
    receiverId: string;
    body: string;
    createdAt: Date;
    sender: Parameters<PrismaStore["publicUser"]>[0];
    receiver: Parameters<PrismaStore["publicUser"]>[0];
  }): PrivateMessage {
    return {
      id: row.id,
      senderId: row.senderId,
      receiverId: row.receiverId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      sender: this.publicUser(row.sender),
      receiver: this.publicUser(row.receiver)
    };
  }

  private franchiseChatMessage(row: {
    id: string;
    franchiseId: string;
    userId: string;
    body: string;
    createdAt: Date;
    user: Parameters<PrismaStore["publicUser"]>[0];
  }): FranchiseChatMessage {
    return {
      id: row.id,
      franchiseId: row.franchiseId,
      userId: row.userId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      user: this.publicUser(row.user)
    };
  }

  private activity(row: {
    id: string;
    userId: string;
    kind: keyof typeof DbActivityKind;
    message: string;
    metadata: unknown;
    createdAt: Date;
  }): Activity {
    return {
      id: row.id,
      userId: row.userId,
      kind: activityFromDb[row.kind],
      message: row.message,
      metadata: (row.metadata ?? null) as JsonRecord,
      createdAt: row.createdAt.toISOString()
    };
  }

  private report(row: {
    id: string;
    reporterId: string;
    targetType: string;
    targetId: string;
    reason: string;
    status: keyof typeof DbReportStatus;
    moderatorId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Report {
    return {
      id: row.id,
      reporterId: row.reporterId,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      status: reportFromDb[row.status],
      moderatorId: row.moderatorId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private async activities(take = 8) {
    return (await (await this.db()).activity.findMany({ orderBy: { createdAt: "desc" }, take })).map((activity) => this.activity(activity));
  }

  private async assertAdmin(actorId: string) {
    const actor = await (await this.db()).user.findUnique({ where: { id: actorId } });
    if (!actor || !adminRoles.includes(roleFromDb[actor.role])) {
      throw new Error("Permesso negato.");
    }
  }

  private async adminLog(actorId: string, action: string, target: string, metadata?: Record<string, unknown>) {
    const db = await this.db();
    await db.adminLog.create({
      data: { actorId, action, target, metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined }
    });
    await db.activity.create({
      data: {
        userId: actorId,
        kind: "ADMIN_ACTION",
        message: action,
        metadata: { target, ...(metadata ?? {}) }
      }
    });
  }

  private async unlockAdminCreatedBadge(userId: string) {
    const badge = await (await this.db()).badge.findFirst({ where: { conditionKind: "ADMIN_CREATED", ownerOnly: false } });
    if (badge) {
      await this.unlockBadge(userId, badge.id, "system");
    }
  }

  private async unlockAutomaticBadges(userId: string) {
    const db = await this.db();
    const completedEpisodes = await db.episodeProgress.count({ where: { userId, completed: true } });
    const completedFranchises = await db.libraryEntry.count({ where: { userId, state: "COMPLETED" } });
    const libraryCount = await db.libraryEntry.count({ where: { userId } });
    const favoritesCount = await db.libraryEntry.count({ where: { userId, favorite: true } });
    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, avatarUrl: true, bannerUrl: true, bio: true } });
    const profileCompleted = Boolean(user?.bio?.trim() && (user.avatarUrl || user.bannerUrl));
    const badges = await db.badge.findMany();
    for (const badge of badges) {
      if (badge.ownerOnly && user?.role !== "OWNER") {
        continue;
      }
      if (badge.conditionKind === "EPISODES_WATCHED" && completedEpisodes >= (badge.conditionValue ?? 0)) {
        await this.unlockBadge(userId, badge.id, "system");
      }
      if (badge.conditionKind === "FRANCHISES_COMPLETED" && completedFranchises >= (badge.conditionValue ?? 0)) {
        await this.unlockBadge(userId, badge.id, "system");
      }
      if (badge.conditionKind === "LIBRARY_COUNT" && libraryCount >= (badge.conditionValue ?? 0)) {
        await this.unlockBadge(userId, badge.id, "system");
      }
      if (badge.conditionKind === "FAVORITES_COUNT" && favoritesCount >= (badge.conditionValue ?? 0)) {
        await this.unlockBadge(userId, badge.id, "system");
      }
      if (badge.conditionKind === "PROFILE_COMPLETED" && profileCompleted) {
        await this.unlockBadge(userId, badge.id, "system");
      }
    }
  }

  private async unlockBadge(userId: string, badgeId: string, assignedBy?: string | null) {
    const db = await this.db();
    const [user, badge] = await Promise.all([db.user.findUnique({ where: { id: userId } }), db.badge.findUnique({ where: { id: badgeId } })]);
    if (!user) {
      throw new Error("Utente non trovato.");
    }
    if (!badge) {
      throw new Error("Badge non trovato.");
    }
    if (badge.ownerOnly && user.role !== "OWNER") {
      throw new Error("Badge riservato all'owner.");
    }
    await db.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId } },
      update: {},
      create: { userId, badgeId, assignedBy }
    });
    const row = await db.userBadge.findUniqueOrThrow({
      where: { userId_badgeId: { userId, badgeId } },
      include: { badge: true }
    });
    await db.activity.create({
      data: {
        userId,
        kind: "BADGE_UNLOCKED",
        message: `Ha sbloccato il badge ${row.badge.name}.`,
        metadata: { badgeId }
      }
    });
    return this.userBadge(row);
  }
}
