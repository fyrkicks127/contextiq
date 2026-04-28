import Fastify from 'fastify'
import type { FastifyBaseLogger } from 'fastify'
import cors from '@fastify/cors'
import { AuditAction, AuditEntity, AuditStatus } from '@prisma/client'
import { logger, AuditLogger, PerformanceTracker } from './utils/logger'
import { getPrismaClient } from './config/database'

declare module 'fastify' {
  interface FastifyRequest {
    startTime: number
  }
}

const prisma = getPrismaClient()
const auditLogger = new AuditLogger(prisma)

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
  }
  tracker.log('health_check')
  return result
})

const shutdown = async () => {
  logger.info('Shutting down server...')
  await auditLogger.logSuccess({
    action: AuditAction.CONFIG_UPDATED,
    entity: AuditEntity.SYSTEM,
    metadata: { event: 'server_stop' },
  })
  await fastify.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })

    await auditLogger.logSuccess({
      action: AuditAction.CONFIG_UPDATED,
      entity: AuditEntity.SYSTEM,
      metadata: { event: 'server_start', port: 3000 },
    })
  } catch (err) {
    logger.error({ err }, 'Failed to start server')
    process.exit(1)
  }
}

start()
