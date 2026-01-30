import { ipcMain, nativeTheme, BrowserWindow } from 'electron'

export function registerThemeHandlers(): void {
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
