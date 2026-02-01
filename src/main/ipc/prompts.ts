import { ipcMain } from 'electron'
import { getDb } from '../db'
import { prompts, promptAppPatterns, histories } from '../db/schema'
import { eq, desc, and, sql } from 'drizzle-orm'
import type { PromptEntry, AppPatternInfo } from '../../shared/types'

export function registerPromptsHandlers(): void {
  ipcMain.handle('prompts:list', async (): Promise<PromptEntry[]> => {
    const db = getDb()
    const results = await db
      .select()
      .from(prompts)
      .orderBy(desc(prompts.isDefault), desc(prompts.updatedAt), desc(prompts.id))

    return Promise.all(results.map(mapToPromptEntry))
  })

  ipcMain.handle('prompts:get', async (_event, id: number): Promise<PromptEntry | undefined> => {
    const db = getDb()
    const result = await db
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .limit(1)

    if (result.length === 0) return undefined
    return await mapToPromptEntry(result[0])
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

    let result
    try {
      result = await db
        .insert(prompts)
        .values({
          name: entry.name,
          content: entry.content,
          appPatterns: null, // 旧カラムは使用しない
          isDefault: entry.isDefault
        })
        .returning()
    } catch (error) {
      // プロンプト名のUNIQUE制約違反
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new Error(`PROMPT_NAME_DUPLICATE:${entry.name}`)
      }
      throw error
    }

    const newPrompt = result[0]

    // 新テーブルにパターンを挿入
    if (entry.appPatterns && entry.appPatterns.length > 0) {
      for (const pattern of entry.appPatterns) {
        if (!pattern.trim()) continue
        try {
          await db.insert(promptAppPatterns).values({
            promptId: newPrompt.id,
            appPattern: pattern.trim()
          })
        } catch (error) {
          // UNIQUE制約違反の場合、分かりやすいエラーを投げる
          if (error instanceof Error && error.message.includes('UNIQUE')) {
            throw new Error(`APP_PATTERN_DUPLICATE:${pattern.trim()}`)
          }
          throw error
        }
      }
    }

    return await mapToPromptEntry(newPrompt)
  })

  ipcMain.handle('prompts:update', async (_event, id: number, entry: Partial<Omit<PromptEntry, 'id' | 'createdAt' | 'updatedAt'>>): Promise<PromptEntry> => {
    const db = getDb()

    // isDefault が true の場合、既存のデフォルトを解除（カスタムプロンプトをデフォルトにする場合）
    if (entry.isDefault) {
      await db
        .update(prompts)
        .set({ isDefault: false })
        .where(eq(prompts.isDefault, true))
    }

    // appPatterns は新テーブルで管理するので、updateData から除外
    const { appPatterns: newPatterns, ...restEntry } = entry
    const updateData: Record<string, unknown> = { ...restEntry }
    // updatedAt を現在時刻に更新
    updateData.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19)

    let result
    try {
      result = await db
        .update(prompts)
        .set(updateData)
        .where(eq(prompts.id, id))
        .returning()
    } catch (error) {
      // プロンプト名のUNIQUE制約違反
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new Error(`PROMPT_NAME_DUPLICATE:${restEntry.name}`)
      }
      throw error
    }

    // パターンが更新された場合、新テーブルを更新
    if (newPatterns !== undefined) {
      // 既存のパターンを削除
      await db.delete(promptAppPatterns).where(eq(promptAppPatterns.promptId, id))

      // 新しいパターンを挿入
      if (newPatterns && newPatterns.length > 0) {
        for (const pattern of newPatterns) {
          if (!pattern.trim()) continue
          try {
            await db.insert(promptAppPatterns).values({
              promptId: id,
              appPattern: pattern.trim()
            })
          } catch (error) {
            // UNIQUE制約違反の場合、分かりやすいエラーを投げる
            if (error instanceof Error && error.message.includes('UNIQUE')) {
              throw new Error(`APP_PATTERN_DUPLICATE:${pattern.trim()}`)
            }
            throw error
          }
        }
      }
    }

    return await mapToPromptEntry(result[0])
  })

  ipcMain.handle('prompts:delete', async (_event, id: number): Promise<void> => {
    const db = getDb()
    await db.delete(prompts).where(eq(prompts.id, id))
  })

  ipcMain.handle('prompts:getForApp', async (_event, appName: string): Promise<PromptEntry | undefined> => {
    const db = getDb()

    // 新テーブルからアプリパターンにマッチするプロンプトを探す
    const allPatterns = await db
      .select({
        promptId: promptAppPatterns.promptId,
        appPattern: promptAppPatterns.appPattern
      })
      .from(promptAppPatterns)

    for (const { promptId, appPattern } of allPatterns) {
      // case-sensitive マッチング
      if (appName.includes(appPattern)) {
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

    return undefined
  })

  // アプリパターン一覧を取得（履歴のappNameも候補に含める）
  ipcMain.handle('prompts:listAppPatterns', async (): Promise<AppPatternInfo[]> => {
    const db = getDb()

    // 1. 登録済みパターン（使用状況付き）
    const registeredPatterns = await db
      .select({
        pattern: promptAppPatterns.appPattern,
        promptId: promptAppPatterns.promptId,
        promptName: prompts.name,
        createdAt: prompts.createdAt
      })
      .from(promptAppPatterns)
      .leftJoin(prompts, eq(promptAppPatterns.promptId, prompts.id))

    const result: AppPatternInfo[] = registeredPatterns.map((p) => ({
      pattern: p.pattern,
      promptId: p.promptId,
      promptName: p.promptName,
      source: 'registered' as const,
      createdAt: p.createdAt || ''
    }))

    // 2. 履歴のappNameからユニークなアプリ名と最新のcreatedAtを取得
    const historyApps = await db
      .select({
        appName: histories.appName,
        createdAt: sql<string>`MAX(${histories.createdAt})`
      })
      .from(histories)
      .where(sql`${histories.appName} IS NOT NULL AND ${histories.appName} != ''`)
      .groupBy(histories.appName)

    // 3. マージして重複排除（登録済みパターンに含まれていないもののみ追加）- case-sensitive
    const registeredSet = new Set(result.map((p) => p.pattern))
    for (const { appName, createdAt } of historyApps) {
      if (appName && !registeredSet.has(appName)) {
        result.push({
          pattern: appName,
          promptId: null,
          promptName: null,
          source: 'history',
          createdAt: createdAt || ''
        })
      }
    }

    // createdAt の降順でソート
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return result
  })

  // デフォルトプロンプトの復元（updatedAt を現在時刻に更新）
  ipcMain.handle('prompts:restoreDefault', async (_event, id: number): Promise<PromptEntry> => {
    const db = getDb()

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const result = await db
      .update(prompts)
      .set({ updatedAt: now })
      .where(and(eq(prompts.id, id), eq(prompts.isDefault, true)))
      .returning()

    if (result.length === 0) {
      throw new Error('Default prompt not found')
    }

    return await mapToPromptEntry(result[0])
  })
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
