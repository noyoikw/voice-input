import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqlite: Database.Database | null = null

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb() {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'voice-input.db')

  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  db = drizzle(sqlite, { schema })

  // テーブル作成
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text TEXT NOT NULL,
      rewritten_text TEXT,
      app_name TEXT,
      prompt_id INTEGER,
      processing_time_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reading TEXT NOT NULL,
      display TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      app_patterns TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS voice_memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      duration INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS prompt_app_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      app_pattern TEXT NOT NULL UNIQUE
    );
  `)

  // マイグレーション: histories テーブルに is_rewritten カラムを追加（既存DBの場合）
  const historiesColumns = sqlite.prepare("PRAGMA table_info(histories)").all() as { name: string }[]
  const hasIsRewritten = historiesColumns.some((col) => col.name === 'is_rewritten')
  if (!hasIsRewritten) {
    sqlite.exec(`ALTER TABLE histories ADD COLUMN is_rewritten INTEGER NOT NULL DEFAULT 0`)
  }

  // マイグレーション: prompts テーブルに updated_at カラムを追加（既存DBの場合）
  const promptsColumns = sqlite.prepare("PRAGMA table_info(prompts)").all() as { name: string }[]
  const hasUpdatedAt = promptsColumns.some((col) => col.name === 'updated_at')
  if (!hasUpdatedAt) {
    // SQLiteの制限: ALTER TABLEでは関数をデフォルトに使えないため、空文字をデフォルトにして後で更新
    sqlite.exec(`ALTER TABLE prompts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`)
    sqlite.exec(`UPDATE prompts SET updated_at = created_at`)
  }

  // マイグレーション: prompts.app_patterns (JSON) から prompt_app_patterns テーブルへ移行
  const existingPatterns = sqlite.prepare('SELECT COUNT(*) as count FROM prompt_app_patterns').get() as { count: number }
  if (existingPatterns.count === 0) {
    // 既存の app_patterns を新テーブルに移行
    const promptsWithPatterns = sqlite.prepare('SELECT id, app_patterns FROM prompts WHERE app_patterns IS NOT NULL').all() as { id: number; app_patterns: string }[]
    const insertPattern = sqlite.prepare('INSERT OR IGNORE INTO prompt_app_patterns (prompt_id, app_pattern) VALUES (?, ?)')
    for (const prompt of promptsWithPatterns) {
      try {
        const patterns: string[] = JSON.parse(prompt.app_patterns)
        for (const pattern of patterns) {
          if (pattern.trim()) {
            insertPattern.run(prompt.id, pattern.trim())
          }
        }
      } catch {
        // JSONパースエラーは無視
      }
    }
    // 移行完了後、旧カラムをクリア
    sqlite.exec('UPDATE prompts SET app_patterns = NULL')
  }

  // prompts.name に UNIQUE インデックスを追加
  const hasNameIndex = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='prompts_name_unique'"
  ).get()
  if (!hasNameIndex) {
    // 既存の重複した名前を解消（連番サフィックスを付ける）
    const duplicates = sqlite.prepare(`
      SELECT id, name, updated_at FROM prompts
      WHERE name IN (SELECT name FROM prompts GROUP BY name HAVING COUNT(*) > 1)
      ORDER BY name, updated_at DESC
    `).all() as { id: number; name: string; updated_at: string }[]

    const nameCount: Record<string, number> = {}
    for (const row of duplicates) {
      if (!nameCount[row.name]) {
        // 最新のものはそのまま（最初にスキップ）
        nameCount[row.name] = 1
      } else {
        // 2つ目以降は連番サフィックスを付ける
        nameCount[row.name]++
        const newName = `${row.name} (${nameCount[row.name]})`
        sqlite.prepare('UPDATE prompts SET name = ? WHERE id = ?').run(newName, row.id)
      }
    }

    sqlite.exec('CREATE UNIQUE INDEX prompts_name_unique ON prompts(name)')
  }

  // デフォルトプロンプトを挿入（存在しない場合）
  const defaultPromptCheck = sqlite.prepare('SELECT id FROM prompts WHERE is_default = 1').get()
  if (!defaultPromptCheck) {
    sqlite.prepare(`
      INSERT INTO prompts (name, content, is_default) VALUES (?, ?, 1)
    `).run(
      'デフォルト',
      `以下の音声認識テキストを、自然な日本語に整形してください。

## ルール
- 句読点を適切に挿入する
- 明らかな言い間違いや重複を修正する
- 文脈から漢字変換を最適化する
- 話し言葉を書き言葉に調整する（ただし丁寧語のレベルは維持）
- 意味を変えない範囲で簡潔にする

{{dictionary}}

## 入力テキスト
{{text}}

## 出力
整形後のテキストのみを出力してください。説明や補足は不要です。`
    )
  }

  return db
}

export function closeDb() {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
  }
}
