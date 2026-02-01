import { ipcMain } from 'electron'
import { getDb } from '../db'
import { histories } from '../db/schema'
import { eq, like, or, desc } from 'drizzle-orm'
import type { HistoryEntry } from '../../shared/types'

export function registerHistoryHandlers(): void {
  ipcMain.handle('history:list', async (_event, limit = 100, offset = 0): Promise<HistoryEntry[]> => {
    const db = getDb()
    const results = await db
      .select()
      .from(histories)
      .orderBy(desc(histories.createdAt))
      .limit(limit)
      .offset(offset)

    return results.map(mapToHistoryEntry)
  })

  ipcMain.handle('history:search', async (_event, query: string): Promise<HistoryEntry[]> => {
    const db = getDb()
    const searchPattern = `%${query}%`
    const results = await db
      .select()
      .from(histories)
      .where(
        or(
          like(histories.rawText, searchPattern),
          like(histories.rewrittenText, searchPattern)
        )
      )
      .orderBy(desc(histories.createdAt))

    return results.map(mapToHistoryEntry)
  })

  ipcMain.handle('history:create', async (_event, entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<HistoryEntry> => {
    const db = getDb()
    const result = await db
      .insert(histories)
      .values({
        rawText: entry.rawText,
        rewrittenText: entry.rewrittenText,
        isRewritten: entry.isRewritten,
        appName: entry.appName,
        promptId: entry.promptId,
        processingTimeMs: entry.processingTimeMs
      })
      .returning()

    return mapToHistoryEntry(result[0])
  })

  ipcMain.handle('history:delete', async (_event, id: number): Promise<void> => {
    const db = getDb()
    await db.delete(histories).where(eq(histories.id, id))
  })

  ipcMain.handle('history:clear', async (): Promise<void> => {
    const db = getDb()
    await db.delete(histories)
  })

  ipcMain.handle('history:exportCsv', async (): Promise<string> => {
    const db = getDb()
    const results = await db
      .select()
      .from(histories)
      .orderBy(desc(histories.createdAt))

    const headers = ['ID', '元テキスト', 'リライト後', 'アプリ名', '処理時間(ms)', '作成日時']
    const rows = results.map(row => [
      row.id,
      `"${(row.rawText || '').replace(/"/g, '""')}"`,
      `"${(row.rewrittenText || '').replace(/"/g, '""')}"`,
      row.appName || '',
      row.processingTimeMs || '',
      row.createdAt
    ].join(','))

    return [headers.join(','), ...rows].join('\n')
  })
}

function mapToHistoryEntry(row: typeof histories.$inferSelect): HistoryEntry {
  return {
    id: row.id,
    rawText: row.rawText,
    rewrittenText: row.rewrittenText,
    isRewritten: row.isRewritten,
    appName: row.appName,
    promptId: row.promptId,
    processingTimeMs: row.processingTimeMs,
    createdAt: row.createdAt
  }
}
