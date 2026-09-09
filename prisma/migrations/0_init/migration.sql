-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OBSERVER', 'ANALYST');

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointId" TEXT,
    "timestampTotal" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isGhostPoint" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observationType" TEXT,
    "videoId" TEXT,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT,
    "observationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pointName" TEXT NOT NULL,
    "trameDebut" INTEGER NOT NULL,
    "trameFin" INTEGER NOT NULL,
    "videoId" TEXT,

    CONSTRAINT "ProjectPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OBSERVER',
    "anonymousId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "typeLabel" TEXT,
    "name" TEXT,
    "source" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "benchmarkSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Observation_pointId_idx" ON "Observation"("pointId" ASC);

-- CreateIndex
CREATE INDEX "Observation_projectId_idx" ON "Observation"("projectId" ASC);

-- CreateIndex
CREATE INDEX "Observation_userId_idx" ON "Observation"("userId" ASC);

-- CreateIndex
CREATE INDEX "Observation_videoId_idx" ON "Observation"("videoId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAccess_projectId_userId_key" ON "ProjectAccess"("projectId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "ProjectAccess_userId_idx" ON "ProjectAccess"("userId" ASC);

-- CreateIndex
CREATE INDEX "ProjectPoint_projectId_idx" ON "ProjectPoint"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectPoint_videoId_idx" ON "ProjectPoint"("videoId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_anonymousId_key" ON "User"("anonymousId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username" ASC);

-- CreateIndex
CREATE INDEX "Video_projectId_idx" ON "Video"("projectId" ASC);

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "ProjectPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPoint" ADD CONSTRAINT "ProjectPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPoint" ADD CONSTRAINT "ProjectPoint_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

