import { defineConfig } from 'drizzle-kit'
import { join } from 'path'
import { app } from 'electron'

// 開発時用のパス（drizzle-kit実行時はElectronコンテキスト外）
const dbPath = process.env.NODE_ENV === 'development'
  ? './voice-input.db'
  : join(app?.getPath('userData') ?? '.', 'voice-input.db')

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath
  }
})
