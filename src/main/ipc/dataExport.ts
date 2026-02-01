import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { settings, dictionary, prompts, histories, promptAppPatterns } from '../db/schema'
import { ne, eq, and, isNull } from 'drizzle-orm'
import type { ExportData, ExportOptions, ImportOptions, ImportResult } from '../../shared/types'
import * as fs from 'fs'

const EXPORT_VERSION = 1

// 辞書の重複チェック（reading + display 完全一致）
async function isDictionaryDuplicate(reading: string, display: string): Promise<boolean> {
  const db = getDb()
  const existing = await db
    .select()
    .from(dictionary)
    .where(and(eq(dictionary.reading, reading), eq(dictionary.display, display)))
    .limit(1)
  return existing.length > 0
}

// 辞書インポート（重複スキップ）
async function importDictionaryWithDedup(
  entries: { reading: string; display: string; createdAt?: string }[]
): Promise<{ imported: number; skipped: number }> {
  const db = getDb()
  let imported = 0
  let skipped = 0
  for (const entry of entries) {
    if (await isDictionaryDuplicate(entry.reading, entry.display)) {
      skipped++
      continue
    }
    await db.insert(dictionary).values({
      reading: entry.reading,
      display: entry.display,
      createdAt: entry.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 19)
    })
    imported++
  }
  return { imported, skipped }
}

// 履歴の重複チェック（rawText + rewrittenText + createdAt 完全一致）
async function isHistoryDuplicate(
  rawText: string,
  rewrittenText: string | null,
  createdAt: string
): Promise<boolean> {
  const db = getDb()
  const existing = await db
    .select()
    .from(histories)
    .where(
      and(
        eq(histories.rawText, rawText),
        rewrittenText !== null
          ? eq(histories.rewrittenText, rewrittenText)
          : isNull(histories.rewrittenText),
        eq(histories.createdAt, createdAt)
      )
    )
    .limit(1)
  return existing.length > 0
}

// プロンプトの重複チェック（name 完全一致）
async function isPromptDuplicate(name: string): Promise<{ isDuplicate: boolean; existingId?: number }> {
  const db = getDb()
  const existing = await db
    .select()
    .from(prompts)
    .where(eq(prompts.name, name))
    .limit(1)
  return {
    isDuplicate: existing.length > 0,
    existingId: existing.length > 0 ? existing[0].id : undefined
  }
}

// 履歴インポート（重複スキップ）
async function importHistoryWithDedup(
  entries: {
    rawText: string
    rewrittenText: string | null
    isRewritten?: boolean
    appName: string | null
    promptId: number | null
    processingTimeMs: number | null
    createdAt: string
  }[]
): Promise<{ imported: number; skipped: number }> {
  const db = getDb()
  let imported = 0
  let skipped = 0
  for (const entry of entries) {
    if (await isHistoryDuplicate(entry.rawText, entry.rewrittenText, entry.createdAt)) {
      skipped++
      continue
    }
    await db.insert(histories).values({
      rawText: entry.rawText,
      rewrittenText: entry.rewrittenText,
      isRewritten: entry.isRewritten ?? false,
      appName: entry.appName,
      promptId: entry.promptId,
      processingTimeMs: entry.processingTimeMs,
      createdAt: entry.createdAt
    })
    imported++
  }
  return { imported, skipped }
}

async function exportData(options: ExportOptions): Promise<boolean> {
  const db = getDb()

  // エクスポートデータを構築（チェックしていない項目はnull）
  const exportDataObj: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: null,
    dictionary: null,
    prompts: null,
    history: null
  }

  // 設定を含める場合
  if (options.includeSettings) {
    const allSettings = await db.select().from(settings).where(ne(settings.key, 'geminiApiKey'))
    const settingsObj: Record<string, string> = {}
    for (const s of allSettings) {
      settingsObj[s.key] = s.value
    }
    exportDataObj.settings = {
      hotkey: settingsObj['hotkey'],
      theme: settingsObj['theme'] as 'system' | 'light' | 'dark' | undefined,
      hudSize: settingsObj['hudSize'] as 'small' | 'medium' | 'large' | undefined,
      hudOpacity: settingsObj['hudOpacity'] ? Number(settingsObj['hudOpacity']) : undefined,
      hudPosition: settingsObj['hudPosition'] as 'center' | 'top' | 'bottom' | undefined
    }
  }

  // 単語帳を含める場合
  if (options.includeDictionary) {
    const dictionaryData = await db.select().from(dictionary)
    exportDataObj.dictionary = dictionaryData.map((d) => ({
      reading: d.reading,
      display: d.display,
      createdAt: d.createdAt
    }))
  }

  // プロンプトを含める場合
  if (options.includePrompts) {
    const promptsData = await db.select().from(prompts)
    const promptsWithPatterns = await Promise.all(
      promptsData.map(async (p) => {
        const patterns = await db
          .select({ appPattern: promptAppPatterns.appPattern })
          .from(promptAppPatterns)
          .where(eq(promptAppPatterns.promptId, p.id))
        return {
          ...p,
          appPatternsArray: patterns.length > 0 ? patterns.map((pat) => pat.appPattern) : null
        }
      })
    )
    exportDataObj.prompts = promptsWithPatterns.map((p) => ({
      name: p.name,
      content: p.content,
      appPatterns: p.appPatternsArray,
      isDefault: p.isDefault,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }))
  }

  // 履歴を含める場合
  if (options.includeHistory) {
    const historyData = await db.select().from(histories)
    exportDataObj.history = historyData.map((h) => ({
      rawText: h.rawText,
      rewrittenText: h.rewrittenText,
      isRewritten: h.isRewritten,
      appName: h.appName,
      promptId: h.promptId,
      processingTimeMs: h.processingTimeMs,
      createdAt: h.createdAt
    }))
  }

  // ファイル保存ダイアログ
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win!, {
    title: 'データをエクスポート',
    defaultPath: `voice-input-data-${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/[\/\s:]/g, '')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  // ファイルに書き込み
  fs.writeFileSync(result.filePath, JSON.stringify(exportDataObj, null, 2), 'utf-8')
  return true
}

async function importData(options: ImportOptions): Promise<ImportResult | null> {
  // ファイル選択ダイアログ
  const win = BrowserWindow.getFocusedWindow()
  const dialogResult = await dialog.showOpenDialog(win!, {
    title: 'データをインポート',
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

    // 上書きモードの場合、選択されたデータのみ削除（ただしデータがnullの場合は削除しない）
    if (options.mode === 'overwrite') {
      if (options.importDictionary && data.dictionary !== null) {
        await db.delete(dictionary)
      }
      if (options.importPrompts && data.prompts !== null) {
        await db.delete(promptAppPatterns) // 先に子テーブルを削除
        await db.delete(prompts)
      }
      if (options.importHistory && data.history !== null) {
        await db.delete(histories)
      }
    }

    // 設定をインポート（選択時のみ、データがnullでない場合）
    if (options.importSettings && data.settings !== null && data.settings !== undefined) {
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

    // 単語帳をインポート（選択時のみ、データがnullでない場合）
    if (options.importDictionary && data.dictionary !== null && data.dictionary !== undefined && data.dictionary.length > 0) {
      if (options.mode === 'merge') {
        // マージモードでは重複排除を使用
        const dedupResult = await importDictionaryWithDedup(data.dictionary)
        result.imported.dictionary = dedupResult.imported
      } else {
        // 上書きモードではそのまま挿入
        for (const d of data.dictionary) {
          await db.insert(dictionary).values({
            reading: d.reading,
            display: d.display,
            createdAt: d.createdAt
          })
          result.imported.dictionary++
        }
      }
    }

    // プロンプトをインポート（選択時のみ、データがnullでない場合）
    if (options.importPrompts && data.prompts !== null && data.prompts !== undefined && data.prompts.length > 0) {
      for (const p of data.prompts) {
        let promptId: number

        if (options.mode === 'merge') {
          // マージモードでは同名プロンプトが存在する場合スキップ
          const duplicateCheck = await isPromptDuplicate(p.name)
          if (duplicateCheck.isDuplicate) {
            // 既存のプロンプトをスキップ（カウントしない）
            continue
          }
        }

        const insertedPrompt = await db
          .insert(prompts)
          .values({
            name: p.name,
            content: p.content,
            appPatterns: null, // 旧カラムは使用しない
            isDefault: p.isDefault,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt || p.createdAt // updatedAt がない場合は createdAt を使用
          })
          .returning()

        promptId = insertedPrompt[0].id

        // 新テーブルにパターンを挿入（重複はスキップ）
        if (p.appPatterns && p.appPatterns.length > 0) {
          for (const pattern of p.appPatterns) {
            if (!pattern.trim()) continue
            try {
              await db.insert(promptAppPatterns).values({
                promptId: promptId,
                appPattern: pattern.trim()
              })
            } catch {
              // UNIQUE制約違反はスキップ（他のプロンプトで使用中）
            }
          }
        }

        result.imported.prompts++
      }
    }

    // 履歴をインポート（選択時のみ、データがnullでない場合）
    if (options.importHistory && data.history !== null && data.history !== undefined && data.history.length > 0) {
      if (options.mode === 'merge') {
        // マージモードでは重複スキップ
        const dedupResult = await importHistoryWithDedup(data.history)
        result.imported.history = dedupResult.imported
      } else {
        // 上書きモードではそのまま挿入
        for (const h of data.history) {
          await db.insert(histories).values({
            rawText: h.rawText,
            rewrittenText: h.rewrittenText,
            isRewritten: h.isRewritten ?? false,
            appName: h.appName,
            promptId: h.promptId,
            processingTimeMs: h.processingTimeMs,
            createdAt: h.createdAt
          })
          result.imported.history++
        }
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
