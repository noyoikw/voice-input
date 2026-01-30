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
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS voice_memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      duration INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `)

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
