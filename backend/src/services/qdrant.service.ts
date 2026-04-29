import { createHash } from 'crypto'
import { QdrantClient } from '@qdrant/js-client-rest'
import { AuditAction, AuditEntity } from '@prisma/client'
import { config } from '../config/env'
import { logger, AuditLogger, PerformanceTracker } from '../utils/logger'
import { getOpenAIService } from './openai.service'

// Converts any string id (cuid, uuid, etc.) to a Qdrant-compatible UUID format
function toQdrantId(id: string): string {
  const h = createHash('md5').update(id).digest('hex')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`
}

type MatchCondition = { key: string; match: { value: string } }
type MustFilter     = { must: MatchCondition[] }

export class QdrantService {
  private client: QdrantClient
  private collectionName: string
  private environment: string
  private auditLogger: AuditLogger
  private openaiService: ReturnType<typeof getOpenAIService>

  constructor(
    auditLogger: AuditLogger,
    openaiService: ReturnType<typeof getOpenAIService>,
  ) {
    this.auditLogger   = auditLogger
    this.openaiService = openaiService
    this.collectionName = config.QDRANT_COLLECTION_NAME
    this.environment    = config.QDRANT_ENVIRONMENT

    this.client = new QdrantClient({
      url:    config.QDRANT_URL,
      apiKey: config.QDRANT_API_KEY,
    })

    logger.info(
      { collection: this.collectionName, environment: this.environment },
      'Qdrant service initialised',
    )
  }

  // ── Every search MUST include environment + projectId to isolate tenant data ──
  private buildFilter(projectId: string, extra: MatchCondition[] = []): MustFilter {
    return {
      must: [
        { key: 'environment', match: { value: this.environment } },
        { key: 'projectId',   match: { value: projectId } },
        ...extra,
      ],
    }
  }

  // ── Collection bootstrap ──────────────────────────────────────────────────────

  async initializeCollection(): Promise<void> {
    const { collections } = await this.client.getCollections()
    const exists = collections.some((c) => c.name === this.collectionName)

    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: { size: config.EMBEDDING_DIMENSION, distance: 'Cosine' },
        optimizers_config: { default_segment_number: 2 },
      })

      // Payload indexes let Qdrant skip unrelated vectors before scoring — critical
      // for multi-tenant correctness and performance on a shared cluster
      await Promise.all([
        this.client.createPayloadIndex(this.collectionName, { field_name: 'environment', field_schema: 'keyword' }),
        this.client.createPayloadIndex(this.collectionName, { field_name: 'projectId',   field_schema: 'keyword' }),
        this.client.createPayloadIndex(this.collectionName, { field_name: 'type',        field_schema: 'keyword' }),
      ])

      logger.info({ collection: this.collectionName }, 'Qdrant collection and indexes created')
    } else {
      logger.info({ collection: this.collectionName }, 'Qdrant collection already exists')
    }

    await this.auditLogger.logSuccess({
      action: AuditAction.CONFIG_UPDATED,
      entity: AuditEntity.SYSTEM,
      metadata: {
        event: 'qdrant_init',
        collection: this.collectionName,
        environment: this.environment,
        created: !exists,
      },
    })
  }

  // ── Indexing ──────────────────────────────────────────────────────────────────

  async indexCodeChunk(params: {
    id: string
    content: string
    filePath: string
    language: string
    projectId: string
    startLine: number
    endLine: number
  }): Promise<void> {
    const tracker = new PerformanceTracker()
    const { embedding, tokens, cost } = await this.openaiService.generateEmbedding(params.content)

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [{
        id:      toQdrantId(params.id),
        vector:  embedding,
        payload: {
          type:        'code_chunk',
          environment: this.environment,
          projectId:   params.projectId,
          chunkId:     params.id,
          filePath:    params.filePath,
          language:    params.language,
          startLine:   params.startLine,
          endLine:     params.endLine,
          content:     params.content,
          indexedAt:   new Date().toISOString(),
        },
      }],
    })

    tracker.log('index_code_chunk')

    await this.auditLogger.logSuccess({
      action:   AuditAction.CODE_UPLOADED,
      entity:   AuditEntity.CODE_CHUNK,
      entityId: params.id,
      metadata: { projectId: params.projectId, filePath: params.filePath, tokens, cost, duration: tracker.getDuration() },
    })
  }

  async indexQuery(params: {
    queryId: string
    query: string
    response: string
    projectId: string
  }): Promise<void> {
    const tracker = new PerformanceTracker()
    const { embedding, tokens, cost } = await this.openaiService.generateEmbedding(params.query)

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [{
        id:      toQdrantId(params.queryId),
        vector:  embedding,
        payload: {
          type:          'query',
          environment:   this.environment,
          projectId:     params.projectId,
          queryId:       params.queryId,
          originalQuery: params.query,
          response:      params.response,
          indexedAt:     new Date().toISOString(),
        },
      }],
    })

    tracker.log('index_query')

    await this.auditLogger.logSuccess({
      action:   AuditAction.EMBEDDING_GENERATED,
      entity:   AuditEntity.QUERY,
      entityId: params.queryId,
      metadata: { projectId: params.projectId, tokens, cost, duration: tracker.getDuration() },
    })
  }

  // ── Similarity search ─────────────────────────────────────────────────────────

  async searchSimilarCode(params: {
    query: string
    projectId: string
    limit?: number
  }): Promise<Array<{ id: string; score: number; content: string; filePath: string; language: string }>> {
    const tracker = new PerformanceTracker()
    const { embedding } = await this.openaiService.generateEmbedding(params.query)

    const filter = this.buildFilter(params.projectId, [
      { key: 'type', match: { value: 'code_chunk' } },
    ])

    const results = await this.client.search(this.collectionName, {
      vector:          embedding,
      filter:          filter as never,
      limit:           params.limit ?? 5,
      score_threshold: config.CACHE_SIMILARITY_THRESHOLD,
      with_payload:    true,
    })

    tracker.log('search_similar_code')

    await this.auditLogger.logSuccess({
      action:   results.length > 0 ? AuditAction.CACHE_HIT : AuditAction.CACHE_MISS,
      entity:   AuditEntity.CODE_CHUNK,
      metadata: { projectId: params.projectId, results: results.length, duration: tracker.getDuration() },
    })

    return results.map((r) => ({
      id:       String(r.payload?.['chunkId'] ?? r.id),
      score:    r.score,
      content:  String(r.payload?.['content']  ?? ''),
      filePath: String(r.payload?.['filePath'] ?? ''),
      language: String(r.payload?.['language'] ?? ''),
    }))
  }

  async searchSimilarQueries(params: {
    query: string
    projectId: string
    limit?: number
  }): Promise<Array<{ queryId: string; score: number; originalQuery: string; response: string }>> {
    const tracker = new PerformanceTracker()
    const { embedding } = await this.openaiService.generateEmbedding(params.query)

    const filter = this.buildFilter(params.projectId, [
      { key: 'type', match: { value: 'query' } },
    ])

    const results = await this.client.search(this.collectionName, {
      vector:          embedding,
      filter:          filter as never,
      limit:           params.limit ?? 5,
      score_threshold: config.CACHE_SIMILARITY_THRESHOLD,
      with_payload:    true,
    })

    tracker.log('search_similar_queries')

    await this.auditLogger.logSuccess({
      action:   results.length > 0 ? AuditAction.CACHE_HIT : AuditAction.CACHE_MISS,
      entity:   AuditEntity.QUERY,
      metadata: { projectId: params.projectId, results: results.length, duration: tracker.getDuration() },
    })

    return results.map((r) => ({
      queryId:       String(r.payload?.['queryId']       ?? ''),
      score:         r.score,
      originalQuery: String(r.payload?.['originalQuery'] ?? ''),
      response:      String(r.payload?.['response']      ?? ''),
    }))
  }

  // ── Deletion ──────────────────────────────────────────────────────────────────

  async deleteProject(projectId: string): Promise<void> {
    const filter = this.buildFilter(projectId)

    await this.client.delete(this.collectionName, { filter: filter as never, wait: true })

    await this.auditLogger.logSuccess({
      action:   AuditAction.PROJECT_DELETED,
      entity:   AuditEntity.PROJECT,
      metadata: { projectId, environment: this.environment },
    })

    logger.info({ projectId, environment: this.environment }, 'Project vectors deleted')
  }

  // ── Stats & health ────────────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalPoints: number
    ourEnvironmentPoints: number
    projectBreakdown: Record<string, number>
  }> {
    const collInfo    = await this.client.getCollection(this.collectionName)
    const totalPoints = (collInfo as unknown as { points_count?: number }).points_count ?? 0

    const envFilter = { must: [{ key: 'environment', match: { value: this.environment } }] }

    const countResult = await this.client.count(this.collectionName, {
      filter: envFilter as never,
      exact:  true,
    })

    const scroll = await this.client.scroll(this.collectionName, {
      filter:       envFilter as never,
      with_payload: ['projectId'],
      limit:        1000,
    })

    const projectBreakdown: Record<string, number> = {}
    for (const point of scroll.points) {
      const pid = String((point.payload as Record<string, unknown>)?.['projectId'] ?? '')
      if (pid) projectBreakdown[pid] = (projectBreakdown[pid] ?? 0) + 1
    }

    return {
      totalPoints,
      ourEnvironmentPoints: countResult.count,
      projectBreakdown,
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.getCollections()
      return true
    } catch {
      return false
    }
  }
}

let qdrantService: QdrantService | null = null

export function getQdrantService(
  auditLogger: AuditLogger,
  openaiService: ReturnType<typeof getOpenAIService>,
): QdrantService {
  if (!qdrantService) {
    qdrantService = new QdrantService(auditLogger, openaiService)
  }
  return qdrantService
}
