CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "FriendRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Friendship" (
  "id" TEXT NOT NULL,
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivateMessage" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivateMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FranchiseChatMessage" (
  "id" TEXT NOT NULL,
  "franchiseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FranchiseChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FriendRequest_requesterId_addresseeId_key" ON "FriendRequest"("requesterId", "addresseeId");
CREATE INDEX "FriendRequest_addresseeId_status_idx" ON "FriendRequest"("addresseeId", "status");
CREATE INDEX "FriendRequest_requesterId_status_idx" ON "FriendRequest"("requesterId", "status");
CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");
CREATE INDEX "Friendship_userAId_idx" ON "Friendship"("userAId");
CREATE INDEX "Friendship_userBId_idx" ON "Friendship"("userBId");
CREATE INDEX "PrivateMessage_senderId_receiverId_createdAt_idx" ON "PrivateMessage"("senderId", "receiverId", "createdAt");
CREATE INDEX "PrivateMessage_receiverId_senderId_createdAt_idx" ON "PrivateMessage"("receiverId", "senderId", "createdAt");
CREATE INDEX "FranchiseChatMessage_franchiseId_createdAt_idx" ON "FranchiseChatMessage"("franchiseId", "createdAt");

ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivateMessage" ADD CONSTRAINT "PrivateMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivateMessage" ADD CONSTRAINT "PrivateMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FranchiseChatMessage" ADD CONSTRAINT "FranchiseChatMessage_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FranchiseChatMessage" ADD CONSTRAINT "FranchiseChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
