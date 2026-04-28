import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

const isDev = process.env.NODE_ENV !== 'production'

let prismaInstance: PrismaClient | null = null

export function getPrismaClient(): PrismaClient {
  if (prismaInstance) return prismaInstance

  prismaInstance = new PrismaClient({
    log: isDev ? ['query', 'error', 'warn'] : ['error'],
  })

  prismaInstance.$connect().then(() => {
    logger.info('Database connected successfully')
  }).catch((err: unknown) => {
    logger.error({ err }, 'Database connection failed')
  })

  process.on('beforeExit', async () => {
    await prismaInstance?.$disconnect()
    logger.info('Database disconnected')
  })

  return prismaInstance
}

export const prisma = getPrismaClient()
