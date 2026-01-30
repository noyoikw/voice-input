import { ipcMain } from 'electron'
import { getDb } from '../db'
import { dictionary } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import type { DictionaryEntry } from '../../shared/types'

export function registerDictionaryHandlers(): void {
  ipcMain.handle('dictionary:list', async (): Promise<DictionaryEntry[]> => {
    const db = getDb()
    const results = await db
      .select()
      .from(dictionary)
      .orderBy(desc(dictionary.createdAt))

    return results.map(mapToDictionaryEntry)
  })

  ipcMain.handle('dictionary:create', async (_event, entry: Omit<DictionaryEntry, 'id' | 'createdAt'>): Promise<DictionaryEntry> => {
    const db = getDb()
    const result = await db
      .insert(dictionary)
      .values({
        reading: entry.reading,
        display: entry.display
      })
      .returning()

    return mapToDictionaryEntry(result[0])
  })

  ipcMain.handle('dictionary:update', async (_event, id: number, entry: Partial<Omit<DictionaryEntry, 'id' | 'createdAt'>>): Promise<DictionaryEntry> => {
    const db = getDb()
    const result = await db
      .update(dictionary)
      .set(entry)
      .where(eq(dictionary.id, id))
      .returning()

    return mapToDictionaryEntry(result[0])
  })

  ipcMain.handle('dictionary:delete', async (_event, id: number): Promise<void> => {
    const db = getDb()
    await db.delete(dictionary).where(eq(dictionary.id, id))
  })
}

function mapToDictionaryEntry(row: typeof dictionary.$inferSelect): DictionaryEntry {
  return {
    id: row.id,
    reading: row.reading,
    display: row.display,
    createdAt: row.createdAt
  }
}
