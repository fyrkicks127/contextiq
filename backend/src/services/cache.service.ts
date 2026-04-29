import { createHash } from 'crypto'
import Redis from 'ioredis'
import { AuditAction, AuditEntity } from '@prisma/client'
import { config } from '../config/env'
import { logger, AuditLogger } from '../utils/logger'

export class CacheService {
  private redis: Redis
  private auditLogger: AuditLogger

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger

    this.redis = new Redis(config.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error('Redis retry limit reached — giving up')
          return null
        }
        const delay = Math.min(times * 200, 2000)
        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`)
        return delay
      },
      lazyConnect: false,
    })

    this.redis.on('connect', () => logger.info('Redis connected'))
    this.redis.on('ready',   () => logger.info('Redis ready'))
    this.redis.on('error',   (err) => logger.error({ err }, 'Redis error'))
    this.redis.on('close',   () => logger.warn('Redis connection closed'))
  }

  private generateKey(query: string, projectId: string): string {
    const hash = createHash('md5').update(query).digest('hex')
    return `cache:${projectId}:${hash}`
  }

  async get(query: string, projectId: string): Promise<string | null> {
    const key = this.generateKey(query, projectId)
    const value = await this.redis.get(key)
    const hit = value !== null

    await this.auditLogger.logSuccess({
      action: hit ? AuditAction.CACHE_HIT : AuditAction.CACHE_MISS,
      entity: AuditEntity.CACHE_ENTRY,
      entityId: key,
      metadata: { projectId, hit },
    })

    return value
  }

  async set(
    query: string,
    projectId: string,
    response: string,
    ttl: number = config.CACHE_TTL,
  ): Promise<void> {
    const key = this.generateKey(query, projectId)
    await this.redis.set(key, response, 'EX', ttl)

    await this.auditLogger.logSuccess({
      action: AuditAction.CACHE_HIT,
      entity: AuditEntity.CACHE_ENTRY,
      entityId: key,
      metadata: { projectId, ttl, action: 'set' },
    })

    logger.debug({ key, ttl }, 'Cache entry stored')
  }

  async has(query: string, projectId: string): Promise<boolean> {
    const key = this.generateKey(query, projectId)
    return (await this.redis.exists(key)) === 1
  }

  async delete(query: string, projectId: string): Promise<void> {
    const key = this.generateKey(query, projectId)
    await this.redis.del(key)

    await this.auditLogger.logSuccess({
      action: AuditAction.CACHE_MISS,
      entity: AuditEntity.CACHE_ENTRY,
      entityId: key,
      metadata: { projectId, action: 'delete' },
    })

    logger.debug({ key }, 'Cache entry deleted')
  }

  async clearProject(projectId: string): Promise<void> {
    const pattern = `cache:${projectId}:*`
    const keys = await this.redis.keys(pattern)

    if (keys.length > 0) {
      await this.redis.del(...keys)
    }

    await this.auditLogger.logSuccess({
      action: AuditAction.CACHE_MISS,
      entity: AuditEntity.CACHE_ENTRY,
      metadata: { projectId, cleared: keys.length, action: 'clearProject' },
    })

    logger.info({ projectId, cleared: keys.length }, 'Project cache cleared')
  }

  async getStats(): Promise<{ totalKeys: number; memoryUsed: string; hitRate: number }> {
    const info = await this.redis.info('all')
    const dbLine = info.split('\n').find((l) => l.startsWith('db0:'))
    const memLine = info.split('\n').find((l) => l.startsWith('used_memory_human:'))
    const hitsLine = info.split('\n').find((l) => l.startsWith('keyspace_hits:'))
    const missesLine = info.split('\n').find((l) => l.startsWith('keyspace_misses:'))

    const totalKeys = dbLine
      ? parseInt(dbLine.match(/keys=(\d+)/)?.[1] ?? '0', 10)
      : 0
    const memoryUsed = memLine?.split(':')[1]?.trim() ?? 'unknown'
    const hits = parseInt(hitsLine?.split(':')[1]?.trim() ?? '0', 10)
    const misses = parseInt(missesLine?.split(':')[1]?.trim() ?? '0', 10)
    const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0

    return { totalKeys, memoryUsed, hitRate }
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.redis.ping()
      return reply === 'PONG'
    } catch {
      return false
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit()
    logger.info('Redis disconnected')
  }
}

let cacheService: CacheService | null = null

export function getCacheService(auditLogger: AuditLogger): CacheService {
  if (!cacheService) {
    cacheService = new CacheService(auditLogger)
  }
  return cacheService
}
