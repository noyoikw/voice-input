import { ipcMain, BrowserWindow } from 'electron'

// TODO: SwiftBridge を実装後に接続
export function registerSpeechHandlers(): void {
  // レガシー: 手動での録音開始（現在はSwift Helperのキー監視を使用）
  ipcMain.handle('speech:start', async () => {
    console.log('speech:start called (legacy)')
    return { success: true }
  })

  // レガシー: 手動での録音停止
  ipcMain.handle('speech:stop', async () => {
    console.log('speech:stop called (legacy)')
    return { success: true }
  })
}

// レンダラーへの通知ヘルパー
export function sendToRenderer(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send(channel, ...args)
  }
}
