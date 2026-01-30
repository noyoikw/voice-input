import { getDb } from '../../db'
import { histories } from '../../db/schema'
import { getActiveAppName } from '../activeApp/detector'
import type { HistoryEntry } from '../../../shared/types'

export async function saveHistory(
  rawText: string,
  rewrittenText: string,
  promptId?: number,
  processingTimeMs?: number
): Promise<HistoryEntry> {
  const db = getDb()
  const appName = await getActiveAppName()

  const result = await db.insert(histories).values({
    rawText,
    rewrittenText,
    appName,
    promptId: promptId ?? null,
    processingTimeMs: processingTimeMs ?? null
  }).returning()

  const row = result[0]
  return {
    id: row.id,
    rawText: row.rawText,
    rewrittenText: row.rewrittenText,
    appName: row.appName,
    promptId: row.promptId,
    processingTimeMs: row.processingTimeMs,
    createdAt: row.createdAt
  }
}
