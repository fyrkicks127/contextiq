import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { logger } from '../utils/logger'

// Resolve project-root .env so this works both in Docker (env vars already set)
// and in local non-Docker development (reads backend/../../.env = project root)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const num = (def: number) => z.coerce.number().default(def)

const envSchema = z.object({
  // ── Database & Cache ─────────────────────────────────────────
  DATABASE_URL: z.string().min(1),
  REDIS_URL:    z.string().min(1),

  // ── OpenAI ───────────────────────────────────────────────────
  OPENAI_API_KEY:         z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL:      z.string().default('gpt-4-turbo'),

  // ── Qdrant ───────────────────────────────────────────────────
  QDRANT_URL:             z.string().url(),
  QDRANT_API_KEY:         z.string().min(1),
  QDRANT_COLLECTION_NAME: z.string().default('contextiq-code-embeddings'),

  // ── App ──────────────────────────────────────────────────────
  NODE_ENV:    z.enum(['development', 'production', 'test']).default('development'),
  PORT:        num(3000),
  API_VERSION: z.string().default('v1'),

  // ── Auth ─────────────────────────────────────────────────────
  JWT_SECRET:               z.string().min(32),
  JWT_EXPIRES_IN:           z.string().default('7d'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // ── Cache & Similarity ───────────────────────────────────────
  CACHE_TTL:                  num(3600),
  CACHE_SIMILARITY_THRESHOLD: num(0.92),

  // ── Rate Limiting ────────────────────────────────────────────
  RATE_LIMIT_MAX:       num(100),
  RATE_LIMIT_WINDOW_MS: num(3_600_000),

  // ── Logging ──────────────────────────────────────────────────
  LOG_LEVEL:  z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // ── Embeddings & Chunking ────────────────────────────────────
  EMBEDDING_DIMENSION: num(1536),
  CHUNK_SIZE:          num(500),
  CHUNK_OVERLAP:       num(50),

  // ── Cost Tracking ────────────────────────────────────────────
  EMBEDDING_COST_PER_1K_TOKENS:          num(0.0001),
  GPT4_TURBO_INPUT_COST_PER_1K_TOKENS:   num(0.01),
  GPT4_TURBO_OUTPUT_COST_PER_1K_TOKENS:  num(0.03),
})

export type Config = z.infer<typeof envSchema>

function validateEnv(): Config {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    result.error.errors.forEach((err) => {
      logger.error(`Config error [${err.path.join('.')}]: ${err.message}`)
    })
    process.exit(1)
  }

  logger.info('Environment configuration validated successfully')
  return result.data
}

export const config = validateEnv()
