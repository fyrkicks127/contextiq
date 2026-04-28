import pino from 'pino'
import { PrismaClient, AuditAction, AuditEntity, AuditStatus } from '@prisma/client'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

export interface AuditLogParams {
  userId?: string
  action: AuditAction
  entity: AuditEntity
  entityId?: string
  method?: string
  endpoint?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
  changes?: Record<string, unknown>
  status: AuditStatus
  errorMessage?: string
  duration?: number
}

export class AuditLogger {
  constructor(private prisma: PrismaClient) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: params })

      logger.info(
        {
          audit: true,
          action: params.action,
          entity: params.entity,
          status: params.status,
          endpoint: params.endpoint,
          duration: params.duration,
        },
        `AUDIT [${params.status}] ${params.action} on ${params.entity}`,
      )
    } catch (err) {
      logger.error({ err }, 'Failed to write audit log')
    }
  }

  async logSuccess(params: Omit<AuditLogParams, 'status'>): Promise<void> {
    await this.log({ ...params, status: AuditStatus.SUCCESS })
  }

  async logFailure(params: Omit<AuditLogParams, 'status'>): Promise<void> {
    await this.log({ ...params, status: AuditStatus.FAILURE })
  }

  async logWarning(params: Omit<AuditLogParams, 'status'>): Promise<void> {
    await this.log({ ...params, status: AuditStatus.WARNING })
  }
}

export class PerformanceTracker {
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  getDuration(): number {
    return Date.now() - this.startTime
  }

  log(operation: string): void {
    logger.info({ operation, duration: this.getDuration() }, `${operation} completed in ${this.getDuration()}ms`)
  }
}
