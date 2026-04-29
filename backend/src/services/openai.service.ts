import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { AuditAction, AuditEntity } from '@prisma/client'
import { config } from '../config/env'
import { logger, AuditLogger, PerformanceTracker } from '../utils/logger'

export class OpenAIService {
  private client: OpenAI
  private auditLogger: AuditLogger

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY })
    logger.info({ model: config.OPENAI_CHAT_MODEL }, 'OpenAI service initialised')
  }

  async generateEmbedding(text: string): Promise<{
    embedding: number[]
    tokens: number
    cost: number
  }> {
    const tracker = new PerformanceTracker()

    const response = await this.client.embeddings.create({
      model: config.OPENAI_EMBEDDING_MODEL,
      input: text,
    })

    const embedding = response.data[0].embedding
    const tokens = response.usage.total_tokens
    const cost = (tokens / 1000) * config.EMBEDDING_COST_PER_1K_TOKENS

    tracker.log('generate_embedding')

    await this.auditLogger.logSuccess({
      action: AuditAction.EMBEDDING_GENERATED,
      entity: AuditEntity.QUERY,
      metadata: {
        model: config.OPENAI_EMBEDDING_MODEL,
        tokens,
        cost,
        duration: tracker.getDuration(),
        dimension: embedding.length,
      },
    })

    return { embedding, tokens, cost }
  }

  async chat(params: {
    messages: Array<{ role: string; content: string }>
    temperature?: number
    maxTokens?: number
  }): Promise<{
    response: string
    model: string
    tokensUsed: { input: number; output: number; total: number }
    cost: number
  }> {
    const tracker = new PerformanceTracker()

    const completion = await this.client.chat.completions.create({
      model: config.OPENAI_CHAT_MODEL,
      messages: params.messages as ChatCompletionMessageParam[],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    })

    const choice = completion.choices[0]
    const response = choice.message.content ?? ''
    const model = completion.model
    const inputTokens = completion.usage?.prompt_tokens ?? 0
    const outputTokens = completion.usage?.completion_tokens ?? 0
    const totalTokens = completion.usage?.total_tokens ?? 0

    const cost =
      (inputTokens / 1000) * config.GPT4_TURBO_INPUT_COST_PER_1K_TOKENS +
      (outputTokens / 1000) * config.GPT4_TURBO_OUTPUT_COST_PER_1K_TOKENS

    tracker.log('chat_completion')

    await this.auditLogger.logSuccess({
      action: AuditAction.QUERY_EXECUTED,
      entity: AuditEntity.QUERY,
      metadata: {
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        duration: tracker.getDuration(),
        finishReason: choice.finish_reason,
      },
    })

    return {
      response,
      model,
      tokensUsed: { input: inputTokens, output: outputTokens, total: totalTokens },
      cost,
    }
  }

  async ping(): Promise<boolean> {
    try {
      // Minimal API call — single-token embedding is cheaper than listing models
      await this.client.embeddings.create({
        model: config.OPENAI_EMBEDDING_MODEL,
        input: 'ping',
      })
      return true
    } catch {
      return false
    }
  }
}

let openaiService: OpenAIService | null = null

export function getOpenAIService(auditLogger: AuditLogger): OpenAIService {
  if (!openaiService) {
    openaiService = new OpenAIService(auditLogger)
  }
  return openaiService
}
