-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DEVELOPER', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "QuerySource" AS ENUM ('CACHE', 'LLM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'REGISTER', 'API_KEY_CREATED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED', 'PROJECT_INDEXED', 'QUERY_EXECUTED', 'CACHE_HIT', 'CACHE_MISS', 'CODE_UPLOADED', 'CODE_VALIDATED', 'EMBEDDING_GENERATED', 'HEALTH_CHECK', 'CONFIG_UPDATED', 'ERROR_OCCURRED');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('USER', 'PROJECT', 'QUERY', 'CODE_CHUNK', 'CACHE_ENTRY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILURE', 'WARNING');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DEVELOPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "repository" TEXT,
    "isIndexed" BOOLEAN NOT NULL DEFAULT false,
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeChunk" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "qdrantPointId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "CodeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Query" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryEmbedding" TEXT,
    "response" TEXT NOT NULL,
    "source" "QuerySource" NOT NULL,
    "model" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "savings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "responseTime" INTEGER NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "chunksRetrieved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "Query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheEntry" (
    "id" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "queryEmbedding" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "model" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entityId" TEXT,
    "method" TEXT,
    "endpoint" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "changes" JSONB,
    "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "duration" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalQueries" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "cacheMisses" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSavings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "uniqueProjects" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_apiKey_idx" ON "User"("apiKey");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE INDEX "Project_isIndexed_idx" ON "Project"("isIndexed");

-- CreateIndex
CREATE UNIQUE INDEX "CodeChunk_qdrantPointId_key" ON "CodeChunk"("qdrantPointId");

-- CreateIndex
CREATE INDEX "CodeChunk_projectId_idx" ON "CodeChunk"("projectId");

-- CreateIndex
CREATE INDEX "CodeChunk_filePath_idx" ON "CodeChunk"("filePath");

-- CreateIndex
CREATE INDEX "CodeChunk_qdrantPointId_idx" ON "CodeChunk"("qdrantPointId");

-- CreateIndex
CREATE INDEX "Query_userId_idx" ON "Query"("userId");

-- CreateIndex
CREATE INDEX "Query_projectId_idx" ON "Query"("projectId");

-- CreateIndex
CREATE INDEX "Query_source_idx" ON "Query"("source");

-- CreateIndex
CREATE INDEX "Query_cacheHit_idx" ON "Query"("cacheHit");

-- CreateIndex
CREATE INDEX "Query_createdAt_idx" ON "Query"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CacheEntry_queryHash_key" ON "CacheEntry"("queryHash");

-- CreateIndex
CREATE INDEX "CacheEntry_queryHash_idx" ON "CacheEntry"("queryHash");

-- CreateIndex
CREATE INDEX "CacheEntry_projectId_idx" ON "CacheEntry"("projectId");

-- CreateIndex
CREATE INDEX "CacheEntry_expiresAt_idx" ON "CacheEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "CacheEntry_lastAccessedAt_idx" ON "CacheEntry"("lastAccessedAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_status_idx" ON "AuditLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetrics_date_key" ON "DailyMetrics"("date");

-- CreateIndex
CREATE INDEX "DailyMetrics_date_idx" ON "DailyMetrics"("date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeChunk" ADD CONSTRAINT "CodeChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Query" ADD CONSTRAINT "Query_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Query" ADD CONSTRAINT "Query_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacheEntry" ADD CONSTRAINT "CacheEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

