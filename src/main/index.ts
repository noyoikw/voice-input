import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc'
import { swiftBridge } from './services/speech/SwiftBridge'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTray(): void {
  try {
    console.log('Creating tray icon...')

    // ファイルからアイコンを読み込む
    const iconPath = is.dev
      ? join(__dirname, '../../resources/trayIconTemplate.png')
      : join(process.resourcesPath, 'trayIconTemplate.png')

    console.log('Icon path:', iconPath)
    const icon = nativeImage.createFromPath(iconPath)
    console.log('Icon created, isEmpty:', icon.isEmpty(), 'size:', icon.getSize())
    icon.setTemplateImage(true)

    tray = new Tray(icon)
    console.log('Tray created successfully')
    tray.setToolTip('Voice Input')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Voice Input - 待機中',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '設定を開く',
        click: showMainWindow
      },
      {
        label: '終了',
        click: () => {
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)

    // macOSではクリックでメニューを表示
    tray.on('click', () => {
      tray?.popUpContextMenu()
    })
  } catch (error) {
    console.error('Failed to create tray:', error)
  }
}

function showMainWindow(): void {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    createMainWindow()
  }
  // ウィンドウ表示時にDockアイコンを表示
  app.dock?.show()
}

function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 480,
    minHeight: 360,
    show: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
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
    // ウィンドウ表示時にDockアイコンを表示
    app.dock?.show()
  })

  // ウィンドウが閉じられたときにDockアイコンを非表示
  mainWindow.on('closed', () => {
    mainWindow = null
    app.dock?.hide()
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

  // メニューバーアプリとして動作: 起動時はDockを非表示
  app.dock?.hide()

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

  // メニューバーアイコン作成
  createTray()

  // 開発モードまたは初回起動時はウィンドウを表示、それ以外はメニューバーのみ
  // 自動起動（wasOpenedAsHidden）の場合はウィンドウを表示しない
  const loginSettings = app.getLoginItemSettings()
  if (is.dev || !loginSettings.wasOpenedAsHidden) {
    createMainWindow()
  }

  // macOS: Dockアイコンクリック時の挙動
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
    app.dock?.show()
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
