import { ipcMain } from 'electron'
import { safeStorage } from 'electron'
import { getDb } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

// electron-store の代わりに safeStorage + SQLite を使用

async function getApiKey(): Promise<string | null> {
  const db = getDb()
  const result = await db.select().from(settings).where(eq(settings.key, 'geminiApiKey')).limit(1)
  if (result.length === 0) return null

  try {
    // 暗号化されたデータを復号
    const encrypted = Buffer.from(result[0].value, 'base64')
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

async function setApiKey(apiKey: string): Promise<void> {
  const db = getDb()
  // safeStorage で暗号化
  const encrypted = safeStorage.encryptString(apiKey)
  const encodedValue = encrypted.toString('base64')

  await db
    .insert(settings)
    .values({ key: 'geminiApiKey', value: encodedValue })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: encodedValue }
    })
}

export function registerGeminiHandlers(): void {
  ipcMain.handle('gemini:rewrite', async (_event, text: string, promptId?: number) => {
    const { performRewrite } = await import('../services/gemini/GeminiClient')
    return performRewrite(text, promptId)
  })

  ipcMain.handle('gemini:setApiKey', async (_event, apiKey: string) => {
    await setApiKey(apiKey)
  })

  ipcMain.handle('gemini:hasApiKey', async () => {
    const key = await getApiKey()
    return !!key
  })
}
