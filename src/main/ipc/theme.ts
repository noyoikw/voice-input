import { ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

export function registerThemeHandlers(): void {
  // 起動時にDBから保存されたテーマ設定を読み込んで適用
  initThemeFromDb()

  ipcMain.handle('theme:get', async (): Promise<'light' | 'dark'> => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  ipcMain.handle('theme:set', async (_event, theme: 'system' | 'light' | 'dark'): Promise<void> => {
    nativeTheme.themeSource = theme
  })

  // テーマ変更時の通知
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    const windows = BrowserWindow.getAllWindows()
    for (const window of windows) {
      window.webContents.send('theme:changed', theme)
    }
  })
}

function initThemeFromDb(): void {
  try {
    const db = getDb()
    const result = db
      .select()
      .from(settings)
      .where(eq(settings.key, 'theme'))
      .limit(1)
      .all()

    if (result.length > 0) {
      const savedTheme = result[0].value as 'system' | 'light' | 'dark'
      nativeTheme.themeSource = savedTheme
      console.log('Theme initialized from DB:', savedTheme)
    }
  } catch (error) {
    console.warn('Failed to initialize theme from DB:', error)
  }
}
