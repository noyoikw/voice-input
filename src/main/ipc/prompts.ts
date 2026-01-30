import { ipcMain } from 'electron'
import { getDb } from '../db'
import { prompts } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import type { PromptEntry } from '../../shared/types'

export function registerPromptsHandlers(): void {
  ipcMain.handle('prompts:list', async (): Promise<PromptEntry[]> => {
    const db = getDb()
    const results = await db
      .select()
      .from(prompts)
      .orderBy(desc(prompts.isDefault), desc(prompts.createdAt))

    return results.map(mapToPromptEntry)
  })

  ipcMain.handle('prompts:get', async (_event, id: number): Promise<PromptEntry | undefined> => {
    const db = getDb()
    const result = await db
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .limit(1)

    if (result.length === 0) return undefined
    return mapToPromptEntry(result[0])
  })

  ipcMain.handle('prompts:create', async (_event, entry: Omit<PromptEntry, 'id' | 'createdAt'>): Promise<PromptEntry> => {
    const db = getDb()

    // isDefault が true の場合、既存のデフォルトを解除
    if (entry.isDefault) {
      await db
        .update(prompts)
        .set({ isDefault: false })
        .where(eq(prompts.isDefault, true))
    }

    const result = await db
      .insert(prompts)
      .values({
        name: entry.name,
        content: entry.content,
        appPatterns: entry.appPatterns ? JSON.stringify(entry.appPatterns) : null,
        isDefault: entry.isDefault
      })
      .returning()

    return mapToPromptEntry(result[0])
  })

  ipcMain.handle('prompts:update', async (_event, id: number, entry: Partial<Omit<PromptEntry, 'id' | 'createdAt'>>): Promise<PromptEntry> => {
    const db = getDb()

    // isDefault が true の場合、既存のデフォルトを解除
    if (entry.isDefault) {
      await db
        .update(prompts)
        .set({ isDefault: false })
        .where(eq(prompts.isDefault, true))
    }

    const updateData: Record<string, unknown> = { ...entry }
    if (entry.appPatterns !== undefined) {
      updateData.appPatterns = entry.appPatterns ? JSON.stringify(entry.appPatterns) : null
    }

    const result = await db
      .update(prompts)
      .set(updateData)
      .where(eq(prompts.id, id))
      .returning()

    return mapToPromptEntry(result[0])
  })

  ipcMain.handle('prompts:delete', async (_event, id: number): Promise<void> => {
    const db = getDb()
    await db.delete(prompts).where(eq(prompts.id, id))
  })

  ipcMain.handle('prompts:getForApp', async (_event, appName: string): Promise<PromptEntry | undefined> => {
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

    return undefined
  })
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
