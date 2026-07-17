CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'USER');
CREATE TYPE "LibraryState" AS ENUM ('PLANNED', 'WATCHING', 'COMPLETED', 'PAUSED', 'DROPPED');
CREATE TYPE "AnimeStatus" AS ENUM ('ANNOUNCED', 'RELEASING', 'FINISHED', 'HIATUS');
CREATE TYPE "WorkFormat" AS ENUM ('TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL');
CREATE TYPE "PrivacyLevel" AS ENUM ('PUBLIC', 'FOLLOWERS', 'PRIVATE');
CREATE TYPE "BadgeRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');
CREATE TYPE "BadgeCategory" AS ENUM ('TRACKING', 'COLLECTION', 'COMMUNITY', 'ADMIN');
CREATE TYPE "BadgeConditionKind" AS ENUM ('EPISODES_WATCHED', 'FRANCHISES_COMPLETED', 'MANUAL', 'ADMIN_CREATED');
CREATE TYPE "ActivityKind" AS ENUM ('REGISTERED', 'LIBRARY_ADDED', 'EPISODE_WATCHED', 'BADGE_UNLOCKED', 'BADGE_EQUIPPED', 'ADMIN_ACTION');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "avatarUrl" TEXT,
  "bannerUrl" TEXT,
  "bio" TEXT,
  "profilePrivacy" "PrivacyLevel" NOT NULL DEFAULT 'PUBLIC',
  "libraryPrivacy" "PrivacyLevel" NOT NULL DEFAULT 'PUBLIC',
  "progressPrivacy" "PrivacyLevel" NOT NULL DEFAULT 'PUBLIC',
  "activityPrivacy" "PrivacyLevel" NOT NULL DEFAULT 'PUBLIC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Franchise" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "coverImage" TEXT,
  "bannerImage" TEXT,
  "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "startYear" INTEGER,
  "status" "AnimeStatus" NOT NULL DEFAULT 'ANNOUNCED',
  "isCompleteAdaptation" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Franchise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Collection" (
  "id" TEXT NOT NULL,
  "franchiseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Work" (
  "id" TEXT NOT NULL,
  "franchiseId" TEXT NOT NULL,
  "collectionId" TEXT,
  "title" TEXT NOT NULL,
  "titleRomaji" TEXT,
  "titleEnglish" TEXT,
  "titleNative" TEXT,
  "description" TEXT,
  "coverImage" TEXT,
  "bannerImage" TEXT,
  "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "startYear" INTEGER,
  "format" "WorkFormat" NOT NULL DEFAULT 'TV',
  "status" "AnimeStatus" NOT NULL DEFAULT 'ANNOUNCED',
  "duration" INTEGER,
  "episodeCount" INTEGER,
  "anilistId" INTEGER,
  "malId" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Season" (
  "id" TEXT NOT NULL,
  "workId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "episodeCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Episode" (
  "id" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "duration" INTEGER,
  "airedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "franchiseId" TEXT NOT NULL,
  "state" "LibraryState" NOT NULL DEFAULT 'PLANNED',
  "score" INTEGER,
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EpisodeProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "watchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EpisodeProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Badge" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rarity" "BadgeRarity" NOT NULL DEFAULT 'COMMON',
  "category" "BadgeCategory" NOT NULL DEFAULT 'TRACKING',
  "conditionKind" "BadgeConditionKind" NOT NULL DEFAULT 'MANUAL',
  "conditionValue" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserBadge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,
  "equippedSlot" INTEGER,
  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Activity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "ActivityKind" NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Report" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "moderatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Franchise_slug_key" ON "Franchise"("slug");
CREATE INDEX "Franchise_title_idx" ON "Franchise"("title");
CREATE INDEX "Franchise_startYear_idx" ON "Franchise"("startYear");
CREATE INDEX "Franchise_status_idx" ON "Franchise"("status");
CREATE INDEX "Collection_franchiseId_sortOrder_idx" ON "Collection"("franchiseId", "sortOrder");
CREATE UNIQUE INDEX "Work_anilistId_key" ON "Work"("anilistId");
CREATE INDEX "Work_franchiseId_sortOrder_idx" ON "Work"("franchiseId", "sortOrder");
CREATE INDEX "Work_collectionId_idx" ON "Work"("collectionId");
CREATE INDEX "Work_anilistId_idx" ON "Work"("anilistId");
CREATE INDEX "Season_workId_sortOrder_idx" ON "Season"("workId", "sortOrder");
CREATE UNIQUE INDEX "Episode_seasonId_number_key" ON "Episode"("seasonId", "number");
CREATE INDEX "Episode_seasonId_number_idx" ON "Episode"("seasonId", "number");
CREATE UNIQUE INDEX "LibraryEntry_userId_franchiseId_key" ON "LibraryEntry"("userId", "franchiseId");
CREATE INDEX "LibraryEntry_userId_state_idx" ON "LibraryEntry"("userId", "state");
CREATE UNIQUE INDEX "EpisodeProgress_userId_episodeId_key" ON "EpisodeProgress"("userId", "episodeId");
CREATE INDEX "EpisodeProgress_userId_completed_idx" ON "EpisodeProgress"("userId", "completed");
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
CREATE UNIQUE INDEX "UserBadge_userId_equippedSlot_key" ON "UserBadge"("userId", "equippedSlot");
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");
CREATE INDEX "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "AdminLog_actorId_createdAt_idx" ON "AdminLog"("actorId", "createdAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Work" ADD CONSTRAINT "Work_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Work" ADD CONSTRAINT "Work_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Season" ADD CONSTRAINT "Season_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EpisodeProgress" ADD CONSTRAINT "EpisodeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EpisodeProgress" ADD CONSTRAINT "EpisodeProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminLog" ADD CONSTRAINT "AdminLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
