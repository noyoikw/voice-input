import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { settings, dictionary, prompts, histories } from '../db/schema'
import { ne } from 'drizzle-orm'
import type { ExportData, ExportOptions, ImportOptions, ImportResult } from '../../shared/types'
import * as fs from 'fs'

const EXPORT_VERSION = 1

async function exportData(options: ExportOptions): Promise<boolean> {
  const db = getDb()

  // 設定を取得（geminiApiKey を除外）
  const allSettings = await db.select().from(settings).where(ne(settings.key, 'geminiApiKey'))
  const settingsObj: Record<string, string> = {}
  for (const s of allSettings) {
    settingsObj[s.key] = s.value
  }

  // 単語帳を取得
  const dictionaryData = await db.select().from(dictionary)

  // プロンプトを取得
  const promptsData = await db.select().from(prompts)

  // エクスポートデータを構築
  const exportData: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      hotkey: settingsObj['hotkey'],
      theme: settingsObj['theme'] as 'system' | 'light' | 'dark' | undefined,
      hudSize: settingsObj['hudSize'] as 'small' | 'medium' | 'large' | undefined,
      hudOpacity: settingsObj['hudOpacity'] ? Number(settingsObj['hudOpacity']) : undefined,
      hudPosition: settingsObj['hudPosition'] as 'center' | 'top' | 'bottom' | undefined
    },
    dictionary: dictionaryData.map((d) => ({
      reading: d.reading,
      display: d.display,
      createdAt: d.createdAt
    })),
    prompts: promptsData.map((p) => ({
      name: p.name,
      content: p.content,
      appPatterns: p.appPatterns ? JSON.parse(p.appPatterns) : null,
      isDefault: p.isDefault,
      createdAt: p.createdAt
    }))
  }

  // 履歴を含める場合
  if (options.includeHistory) {
    const historyData = await db.select().from(histories)
    exportData.history = historyData.map((h) => ({
      rawText: h.rawText,
      rewrittenText: h.rewrittenText,
      appName: h.appName,
      promptId: h.promptId,
      processingTimeMs: h.processingTimeMs,
      createdAt: h.createdAt
    }))
  }

  // ファイル保存ダイアログ
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win!, {
    title: '設定をエクスポート',
    defaultPath: `voice-input-settings-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  // ファイルに書き込み
  fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
  return true
}

async function importData(options: ImportOptions): Promise<ImportResult | null> {
  // ファイル選択ダイアログ
  const win = BrowserWindow.getFocusedWindow()
  const dialogResult = await dialog.showOpenDialog(win!, {
    title: '設定をインポート',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })

  // キャンセルの場合は null を返す
  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return null
  }

  const result: ImportResult = {
    success: false,
    imported: {
      settings: 0,
      dictionary: 0,
      prompts: 0,
      history: 0
    },
    errors: []
  }

  try {
    const content = fs.readFileSync(dialogResult.filePaths[0], 'utf-8')
    const data: ExportData = JSON.parse(content)

    // バージョンチェック
    if (!data.version || data.version > EXPORT_VERSION) {
      result.errors.push('サポートされていないファイル形式です')
      return result
    }

    const db = getDb()

    // 上書きモードの場合、既存データを削除
    if (options.mode === 'overwrite') {
      await db.delete(dictionary)
      await db.delete(prompts)
      if (data.history) {
        await db.delete(histories)
      }
    }

    // 設定をインポート
    if (data.settings) {
      const settingsToImport: { key: string; value: string }[] = []
      if (data.settings.hotkey) settingsToImport.push({ key: 'hotkey', value: data.settings.hotkey })
      if (data.settings.theme) settingsToImport.push({ key: 'theme', value: data.settings.theme })
      if (data.settings.hudSize) settingsToImport.push({ key: 'hudSize', value: data.settings.hudSize })
      if (data.settings.hudOpacity !== undefined)
        settingsToImport.push({ key: 'hudOpacity', value: String(data.settings.hudOpacity) })
      if (data.settings.hudPosition)
        settingsToImport.push({ key: 'hudPosition', value: data.settings.hudPosition })

      for (const s of settingsToImport) {
        await db
          .insert(settings)
          .values(s)
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: s.value }
          })
        result.imported.settings++
      }
    }

    // 単語帳をインポート
    if (data.dictionary && data.dictionary.length > 0) {
      for (const d of data.dictionary) {
        await db.insert(dictionary).values({
          reading: d.reading,
          display: d.display,
          createdAt: d.createdAt
        })
        result.imported.dictionary++
      }
    }

    // プロンプトをインポート
    if (data.prompts && data.prompts.length > 0) {
      for (const p of data.prompts) {
        await db.insert(prompts).values({
          name: p.name,
          content: p.content,
          appPatterns: p.appPatterns ? JSON.stringify(p.appPatterns) : null,
          isDefault: p.isDefault,
          createdAt: p.createdAt
        })
        result.imported.prompts++
      }
    }

    // 履歴をインポート
    if (data.history && data.history.length > 0) {
      for (const h of data.history) {
        await db.insert(histories).values({
          rawText: h.rawText,
          rewrittenText: h.rewrittenText,
          appName: h.appName,
          promptId: h.promptId,
          processingTimeMs: h.processingTimeMs,
          createdAt: h.createdAt
        })
        result.imported.history++
      }
    }

    result.success = true
  } catch (error) {
    result.errors.push(`インポートに失敗しました: ${error instanceof Error ? error.message : String(error)}`)
  }

  return result
}

export function registerDataExportHandlers(): void {
  ipcMain.handle('data:export', async (_event, options: ExportOptions) => {
    return exportData(options)
  })

  ipcMain.handle('data:import', async (_event, options: ImportOptions) => {
    return importData(options)
  })
}
