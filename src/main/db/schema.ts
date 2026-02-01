import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// 音声入力履歴
export const histories = sqliteTable('histories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rawText: text('raw_text').notNull(),
  rewrittenText: text('rewritten_text'),
  isRewritten: integer('is_rewritten', { mode: 'boolean' }).notNull().default(false),
  appName: text('app_name'),
  promptId: integer('prompt_id'),
  processingTimeMs: integer('processing_time_ms'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`)
})

// アプリ設定
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

// 単語帳
export const dictionary = sqliteTable('dictionary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reading: text('reading').notNull(),
  display: text('display').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`)
})

// プロンプトテンプレート
export const prompts = sqliteTable('prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  appPatterns: text('app_patterns'), // JSON配列として保存
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now', 'localtime'))`)
})

// プロンプト対象アプリパターン（1:Nリレーション）
export const promptAppPatterns = sqliteTable('prompt_app_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  promptId: integer('prompt_id')
    .notNull()
    .references(() => prompts.id, { onDelete: 'cascade' }),
  appPattern: text('app_pattern').notNull().unique()
})

// ボイスメモ（将来機能）
export const voiceMemos = sqliteTable('voice_memos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  rawText: text('raw_text').notNull(),
  duration: integer('duration'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`)
})

// 型エクスポート
export type History = typeof histories.$inferSelect
export type NewHistory = typeof histories.$inferInsert
export type Setting = typeof settings.$inferSelect
export type DictionaryWord = typeof dictionary.$inferSelect
export type NewDictionaryWord = typeof dictionary.$inferInsert
export type Prompt = typeof prompts.$inferSelect
export type NewPrompt = typeof prompts.$inferInsert
export type PromptAppPattern = typeof promptAppPatterns.$inferSelect
export type NewPromptAppPattern = typeof promptAppPatterns.$inferInsert
