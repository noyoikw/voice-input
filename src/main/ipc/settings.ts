import { ipcMain, app, shell } from 'electron'
import { getDb } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Settings } from '../../shared/types'
import { swiftBridge } from '../services/speech/SwiftBridge'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async <K extends keyof Settings>(_event: unknown, key: K): Promise<Settings[K] | undefined> => {
    const db = getDb()
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1)

    if (result.length === 0) return undefined

    try {
      return JSON.parse(result[0].value) as Settings[K]
    } catch {
      return result[0].value as Settings[K]
    }
  })

  ipcMain.handle('settings:set', async <K extends keyof Settings>(_event: unknown, key: K, value: Settings[K]): Promise<void> => {
    const db = getDb()
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)

    await db
      .insert(settings)
      .values({ key, value: stringValue })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: stringValue }
      })

    // ホットキー変更時はSwift Helperに通知
    if (key === 'hotkey' && typeof value === 'string') {
      swiftBridge.setHotkey(value)
    }
  })

  ipcMain.handle('settings:getAll', async (): Promise<Settings> => {
    const db = getDb()
    const results = await db.select().from(settings)

    const settingsObj: Settings = {}
    for (const row of results) {
      try {
        ;(settingsObj as Record<string, unknown>)[row.key] = JSON.parse(row.value)
      } catch {
        ;(settingsObj as Record<string, unknown>)[row.key] = row.value
      }
    }

    return settingsObj
  })

  // 自動起動設定
  ipcMain.handle('settings:getAutoLaunch', (): boolean => {
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin
  })

  ipcMain.handle('settings:setAutoLaunch', (_event, enabled: boolean): void => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    })
  })

  ipcMain.handle('settings:openAutoLaunchSettings', async (): Promise<void> => {
    // macOS Ventura以降のログイン項目設定を開く
    await shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension')
  })

  // アプリバージョン取得
  ipcMain.handle('app:getVersion', (): string => {
    return app.getVersion()
  })
}
