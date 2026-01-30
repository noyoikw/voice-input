import { getDb } from '../../db'
import { prompts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { PromptEntry } from '../../../shared/types'

export async function getPromptForApp(appName: string): Promise<PromptEntry | null> {
  const db = getDb()

  // まずアプリパターンにマッチするプロンプトを探す
  const allPrompts = await db.select().from(prompts)

  for (const prompt of allPrompts) {
    if (prompt.appPatterns) {
      try {
        const patterns: string[] = JSON.parse(prompt.appPatterns)
        for (const pattern of patterns) {
          if (appName.toLowerCase().includes(pattern.toLowerCase())) {
            return mapToPromptEntry(prompt)
          }
        }
      } catch {
        // パターンのパースエラーは無視
      }
    }
  }

  // マッチしない場合はデフォルトプロンプトを返す
  const defaultPrompt = await db
    .select()
    .from(prompts)
    .where(eq(prompts.isDefault, true))
    .limit(1)

  if (defaultPrompt.length > 0) {
    return mapToPromptEntry(defaultPrompt[0])
  }

  return null
}

function mapToPromptEntry(row: typeof prompts.$inferSelect): PromptEntry {
  let appPatterns: string[] | null = null
  if (row.appPatterns) {
    try {
      appPatterns = JSON.parse(row.appPatterns)
    } catch {
      appPatterns = null
    }
  }

  return {
    id: row.id,
    name: row.name,
    content: row.content,
    appPatterns,
    isDefault: row.isDefault,
    createdAt: row.createdAt
  }
}
