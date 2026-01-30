import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc'
import { swiftBridge } from './services/speech/SwiftBridge'

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 480,
    minHeight: 360,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    vibrancy: 'sidebar',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  // macOS向けの設定
  electronApp.setAppUserModelId('com.voiceinput.app')

  // 開発時のホットリロード最適化
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // データベース初期化
  initDb()

  // IPCハンドラー登録
  registerIpcHandlers()

  // Swift Helper 起動
  swiftBridge.start()

  // メインウィンドウ作成
  createMainWindow()

  // macOS: Dockアイコンクリック時の挙動
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// 全ウィンドウが閉じられたときの挙動
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// アプリ終了時のクリーンアップ
app.on('before-quit', () => {
  swiftBridge.stop()
  closeDb()
})

export { mainWindow }
