import { getDb } from '../../db'
import { prompts, promptAppPatterns } from '../../db/schema'
import { eq, desc } from 'drizzle-orm'
import type { PromptEntry } from '../../../shared/types'

export async function getPromptForApp(appName: string): Promise<PromptEntry | null> {
  const db = getDb()

  // 新テーブル（promptAppPatterns）からアプリパターンにマッチするプロンプトを探す
  const allPatterns = await db
    .select({
      promptId: promptAppPatterns.promptId,
      appPattern: promptAppPatterns.appPattern
    })
    .from(promptAppPatterns)

  for (const { promptId, appPattern } of allPatterns) {
    // case-insensitive マッチング
    if (appName.toLowerCase().includes(appPattern.toLowerCase())) {
      const prompt = await db
        .select()
        .from(prompts)
        .where(eq(prompts.id, promptId))
        .limit(1)
      if (prompt.length > 0) {
        return await mapToPromptEntry(prompt[0])
      }
    }
  }

  // マッチしない場合はデフォルトプロンプト（isDefault: true かつ updatedAt 最新）を返す
  const defaultPrompt = await db
    .select()
    .from(prompts)
    .where(eq(prompts.isDefault, true))
    .orderBy(desc(prompts.updatedAt), desc(prompts.id))
    .limit(1)

  if (defaultPrompt.length > 0) {
    return await mapToPromptEntry(defaultPrompt[0])
  }

  return null
}

async function mapToPromptEntry(row: typeof prompts.$inferSelect): Promise<PromptEntry> {
  const db = getDb()

  // 新テーブルからパターンを取得
  const patterns = await db
    .select({ appPattern: promptAppPatterns.appPattern })
    .from(promptAppPatterns)
    .where(eq(promptAppPatterns.promptId, row.id))

  const appPatterns = patterns.length > 0 ? patterns.map((p) => p.appPattern) : null

  return {
    id: row.id,
    name: row.name,
    content: row.content,
    appPatterns,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}
