import { config } from './config/env'
import Fastify from 'fastify'
import type { FastifyBaseLogger } from 'fastify'
import cors from '@fastify/cors'
import { AuditAction, AuditEntity, AuditStatus } from '@prisma/client'
import { logger, AuditLogger, PerformanceTracker } from './utils/logger'
import { getPrismaClient } from './config/database'
import { getCacheService } from './services/cache.service'

declare module 'fastify' {
  interface FastifyRequest {
    startTime: number
  }
}

const prisma      = getPrismaClient()
const auditLogger = new AuditLogger(prisma)
const cache       = getCacheService(auditLogger)

await auditLogger.logSuccess({
  action: AuditAction.CONFIG_UPDATED,
  entity: AuditEntity.SYSTEM,
  metadata: { event: 'cache_service_init' },
})

const fastify = Fastify({ logger: logger as unknown as FastifyBaseLogger })

await fastify.register(cors, {
  origin: true,
  credentials: true,
})

fastify.addHook('onRequest', async (request) => {
  request.startTime = Date.now()
})

fastify.addHook('onResponse', async (request, reply) => {
  const duration = Date.now() - request.startTime
  const isHealth = request.url === '/health'

  await auditLogger.log({
    action: isHealth ? AuditAction.HEALTH_CHECK : AuditAction.QUERY_EXECUTED,
    entity: AuditEntity.SYSTEM,
    method: request.method,
    endpoint: request.url,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    status: reply.statusCode >= 400 ? AuditStatus.FAILURE : AuditStatus.SUCCESS,
    duration,
    metadata: { statusCode: reply.statusCode },
  })
})

fastify.get('/health', async () => {
  const tracker = new PerformanceTracker()
  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.NODE_ENV,
    version: config.API_VERSION,
  }
  tracker.log('health_check')
  return result
})

fastify.get(`/api/${config.API_VERSION}/cache/stats`, async (request, reply) => {
  const alive = await cache.ping()
  if (!alive) {
    reply.status(503)
    return { error: 'Redis unavailable' }
  }
  return cache.getStats()
})

const shutdown = async () => {
  logger.info('Shutting down server...')
  await auditLogger.logSuccess({
    action: AuditAction.CONFIG_UPDATED,
    entity: AuditEntity.SYSTEM,
    metadata: { event: 'server_stop' },
  })
  await cache.disconnect()
  await fastify.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

const start = async () => {
  try {
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' })

    await auditLogger.logSuccess({
      action: AuditAction.CONFIG_UPDATED,
      entity: AuditEntity.SYSTEM,
      metadata: { event: 'server_start', port: config.PORT, env: config.NODE_ENV },
    })
  } catch (err) {
    logger.error({ err }, 'Failed to start server')
    process.exit(1)
  }
}

start()
