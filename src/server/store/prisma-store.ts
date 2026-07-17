import {
  ActivityKind as DbActivityKind,
  AnimeStatus as DbAnimeStatus,
  BadgeCategory as DbBadgeCategory,
  BadgeConditionKind as DbBadgeConditionKind,
  BadgeRarity as DbBadgeRarity,
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
  BadgeRarity,
  EpisodeProgress,
  Franchise,
  FranchiseFilters,
  HomePayload,
  LibraryEntry,
  LibraryState,
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
import { createSessionToken, hashPassword, hashSessionToken, sessionExpiryDate } from "@/server/security";
import { getPrismaClient } from "@/server/prisma";
import {
  ANILIST_COLLECTION_TITLE,
  anilistEpisodeCap,
  episodeDrafts,
  franchiseDescription,
  groupAniListCandidates,
  seasonTitle
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
  ADMIN: "admin"
};

const categoryToDb: Record<BadgeCategory, keyof typeof DbBadgeCategory> = {
  tracking: "TRACKING",
  collezione: "COLLECTION",
  community: "COMMUNITY",
  admin: "ADMIN"
};

const conditionFromDb: Record<keyof typeof DbBadgeConditionKind, BadgeConditionKind> = {
  EPISODES_WATCHED: "episodes_watched",
  FRANCHISES_COMPLETED: "franchises_completed",
  MANUAL: "manual",
  ADMIN_CREATED: "admin_created"
};

const conditionToDb: Record<BadgeConditionKind, keyof typeof DbBadgeConditionKind> = {
  episodes_watched: "EPISODES_WATCHED",
  franchises_completed: "FRANCHISES_COMPLETED",
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
    rarity: "comune",
    category: "tracking",
    conditionKind: "episodes_watched",
    conditionValue: 1
  },
  {
    slug: "dieci-episodi",
    name: "Dieci episodi",
    description: "Hai completato dieci episodi.",
    rarity: "raro",
    category: "tracking",
    conditionKind: "episodes_watched",
    conditionValue: 10
  },
  {
    slug: "franchise-completo",
    name: "Franchise completato",
    description: "Hai completato un intero franchise.",
    rarity: "epico",
    category: "collezione",
    conditionKind: "franchises_completed",
    conditionValue: 1
  },
  {
    slug: "curatore",
    name: "Curatore",
    description: "Hai contribuito alla struttura del catalogo.",
    rarity: "raro",
    category: "admin",
    conditionKind: "admin_created",
    conditionValue: 1
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
          rarity: rarityToDb[badge.rarity],
          category: categoryToDb[badge.category],
          conditionKind: conditionToDb[badge.conditionKind],
          conditionValue: badge.conditionValue ?? null
        }
      });
    }

    const ownerEmail = process.env.FRAMORY_OWNER_EMAIL?.toLowerCase();
    const ownerPassword = process.env.FRAMORY_OWNER_PASSWORD;
    if (ownerEmail && ownerPassword) {
      const ownerCount = await db.user.count({ where: { role: "OWNER" } });
      if (ownerCount === 0) {
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
      let franchiseId = await this.findFranchiseIdByAniListIds(db, group.ids);
      if (!franchiseId) {
        franchiseId = await this.createAniListFranchise(db, group.primary);
      }

      const collectionId = await this.ensureAniListCollection(db, franchiseId);
      await this.mergeAniListFranchises(db, franchiseId, group.ids, collectionId);

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
    const [badges, userBadges] = await Promise.all([
      db.badge.findMany({ orderBy: { name: "asc" } }),
      userId ? db.userBadge.findMany({ where: { userId }, include: { badge: true } }) : []
    ]);
    return {
      badges: badges.map((badge) => this.badge(badge)),
      userBadges: userBadges.map((badge) => this.userBadge(badge))
    };
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

  private async db() {
    return (await getPrismaClient()) as DbClient;
  }

  private async findFranchiseIdByAniListIds(db: DbClient, ids: number[]) {
    const rows = await db.work.findMany({
      where: { anilistId: { in: ids } },
      select: { franchiseId: true, franchise: { select: { createdAt: true } } }
    });
    return rows.sort((a, b) => a.franchise.createdAt.getTime() - b.franchise.createdAt.getTime())[0]?.franchiseId ?? null;
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

  private async mergeAniListFranchises(db: DbClient, targetFranchiseId: string, ids: number[], collectionId: string) {
    await db.work.updateMany({
      where: { franchiseId: targetFranchiseId, anilistId: { in: ids } },
      data: { collectionId }
    });

    const duplicates = await db.work.findMany({
      where: { franchiseId: { not: targetFranchiseId }, anilistId: { in: ids } },
      select: { franchiseId: true }
    });
    const duplicateFranchiseIds = Array.from(new Set(duplicates.map((work) => work.franchiseId)));
    if (!duplicateFranchiseIds.length) {
      return;
    }

    const libraryEntries = await db.libraryEntry.findMany({ where: { franchiseId: { in: duplicateFranchiseIds } } });
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
      where: { franchiseId: { in: duplicateFranchiseIds } },
      data: { franchiseId: targetFranchiseId, collectionId }
    });
    await db.franchise.deleteMany({ where: { id: { in: duplicateFranchiseIds } } });
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
    rarity: keyof typeof DbBadgeRarity;
    category: keyof typeof DbBadgeCategory;
    conditionKind: keyof typeof DbBadgeConditionKind;
    conditionValue: number | null;
  }): Badge {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      rarity: rarityFromDb[row.rarity],
      category: categoryFromDb[row.category],
      conditionKind: conditionFromDb[row.conditionKind],
      conditionValue: row.conditionValue
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
    const badge = await (await this.db()).badge.findFirst({ where: { conditionKind: "ADMIN_CREATED" } });
    if (badge) {
      await this.unlockBadge(userId, badge.id, "system");
    }
  }

  private async unlockAutomaticBadges(userId: string) {
    const db = await this.db();
    const completedEpisodes = await db.episodeProgress.count({ where: { userId, completed: true } });
    const completedFranchises = await db.libraryEntry.count({ where: { userId, state: "COMPLETED" } });
    const badges = await db.badge.findMany();
    for (const badge of badges) {
      if (badge.conditionKind === "EPISODES_WATCHED" && completedEpisodes >= (badge.conditionValue ?? 0)) {
        await this.unlockBadge(userId, badge.id, "system");
      }
      if (badge.conditionKind === "FRANCHISES_COMPLETED" && completedFranchises >= (badge.conditionValue ?? 0)) {
        await this.unlockBadge(userId, badge.id, "system");
      }
    }
  }

  private async unlockBadge(userId: string, badgeId: string, assignedBy?: string | null) {
    const db = await this.db();
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
