// 音声認識の状態
export type SpeechStatus = 'idle' | 'recognizing' | 'rewriting' | 'completed' | 'error'

// Swift Helper からの権限状態
export interface SwiftPermissions {
  speechRecognition: 'granted' | 'denied' | 'not_determined' | 'restricted'
  microphone: 'granted' | 'denied' | 'not_determined' | 'restricted'
}

// Swift Helper からのメッセージ
export interface SwiftMessage {
  type: 'ready' | 'started' | 'partial' | 'final' | 'stopped' | 'cancelled' | 'level' | 'error' | 'permissions'
  text?: string
  level?: number
  code?: string
  message?: string
  sessionId?: string
  permissions?: SwiftPermissions
}

// Main Process から Swift Helper へのメッセージ
export interface MainToSwiftMessage {
  type: 'rewrite:start' | 'rewrite:done' | 'rewrite:error' | 'hud:update' | 'hotkey:set' | 'permissions:check'
  sessionId?: string
  message?: string
  size?: 'small' | 'medium' | 'large'
  opacity?: number
  position?: 'center' | 'top' | 'bottom'
  hotkey?: string
}

// 履歴エントリ
export interface HistoryEntry {
  id: number
  rawText: string
  rewrittenText: string | null
  isRewritten: boolean
  appName: string | null
  promptId: number | null
  processingTimeMs: number | null
  createdAt: string
}

// 単語帳エントリ
export interface DictionaryEntry {
  id: number
  reading: string
  display: string
  createdAt: string
}

// プロンプトエントリ
export interface PromptEntry {
  id: number
  name: string
  content: string
  appPatterns: string[] | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

// アプリパターン情報（候補表示用）
export interface AppPatternInfo {
  pattern: string
  promptId: number | null
  promptName: string | null
  source: 'history' | 'registered'
  createdAt: string
}

// 設定
export interface Settings {
  geminiApiKey?: string
  hotkey?: string
  theme?: 'system' | 'light' | 'dark'
  hudSize?: 'small' | 'medium' | 'large'
  hudOpacity?: number
  hudPosition?: 'center' | 'top' | 'bottom'
}

// 権限ステータス
export interface PermissionStatus {
  accessibility: boolean
  microphone: 'granted' | 'denied' | 'not_determined' | 'restricted' | 'unknown'
  speechRecognition: 'granted' | 'denied' | 'not_determined' | 'restricted' | 'unknown'
}

// エクスポートデータ
export interface ExportData {
  version: number
  exportedAt: string
  settings: Omit<Settings, 'geminiApiKey'> | null
  dictionary: Omit<DictionaryEntry, 'id'>[] | null
  prompts: Omit<PromptEntry, 'id'>[] | null
  history?: Omit<HistoryEntry, 'id'>[] | null
}

// エクスポートオプション
export interface ExportOptions {
  includeSettings: boolean
  includeHistory: boolean
  includeDictionary: boolean
  includePrompts: boolean
}

// インポートオプション
export interface ImportOptions {
  mode: 'overwrite' | 'merge'
  importSettings: boolean
  importHistory: boolean
  importDictionary: boolean
  importPrompts: boolean
}

// インポート結果
export interface ImportResult {
  success: boolean
  imported: {
    settings: number
    dictionary: number
    prompts: number
    history: number
  }
  errors: string[]
}


// Electron API (preload経由で公開)
export interface ElectronAPI {
  // Speech
  onSpeechText: (callback: (text: string, isFinal: boolean) => void) => () => void
  onSpeechError: (callback: (error: { code: string; message: string }) => void) => () => void
  onSpeechStatus: (callback: (status: SpeechStatus) => void) => () => void
  onSpeechLevel: (callback: (level: number) => void) => () => void

  // Gemini
  geminiRewrite: (text: string, promptId?: number) => Promise<string>
  geminiSetApiKey: (apiKey: string) => Promise<void>
  geminiHasApiKey: () => Promise<boolean>
  geminiDeleteApiKey: () => Promise<void>

  // History
  historyList: (limit?: number, offset?: number) => Promise<HistoryEntry[]>
  historySearch: (query: string) => Promise<HistoryEntry[]>
  historyCreate: (entry: Omit<HistoryEntry, 'id' | 'createdAt'>) => Promise<HistoryEntry>
  historyDelete: (id: number) => Promise<void>
  historyClear: () => Promise<void>
  historyExportCsv: () => Promise<string>
  onHistoryCreated: (callback: (entry: HistoryEntry) => void) => () => void

  // Settings
  settingsGet: <K extends keyof Settings>(key: K) => Promise<Settings[K] | undefined>
  settingsSet: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
  settingsGetAll: () => Promise<Settings>
  settingsGetAutoLaunch: () => Promise<boolean>
  settingsSetAutoLaunch: (enabled: boolean) => Promise<void>
  settingsOpenAutoLaunchSettings: () => Promise<void>

  // Dictionary
  dictionaryList: () => Promise<DictionaryEntry[]>
  dictionaryCreate: (entry: Omit<DictionaryEntry, 'id' | 'createdAt'>) => Promise<DictionaryEntry>
  dictionaryUpdate: (id: number, entry: Partial<Omit<DictionaryEntry, 'id' | 'createdAt'>>) => Promise<DictionaryEntry>
  dictionaryDelete: (id: number) => Promise<void>

  // Prompts
  promptsList: () => Promise<PromptEntry[]>
  promptsGet: (id: number) => Promise<PromptEntry | undefined>
  promptsCreate: (entry: Omit<PromptEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PromptEntry>
  promptsUpdate: (id: number, entry: Partial<Omit<PromptEntry, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<PromptEntry>
  promptsDelete: (id: number) => Promise<void>
  promptsGetForApp: (appName: string) => Promise<PromptEntry | undefined>
  promptsRestoreDefault: (id: number) => Promise<PromptEntry>
  promptsListAppPatterns: () => Promise<AppPatternInfo[]>

  // Theme
  themeGet: () => Promise<'light' | 'dark'>
  themeSet: (theme: 'system' | 'light' | 'dark') => Promise<void>
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void

  // Window
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void

  // Permissions
  permissionsCheck: () => Promise<PermissionStatus>
  permissionsRequestAccessibility: () => Promise<boolean>
  permissionsOpenAccessibilitySettings: () => Promise<void>
  permissionsOpenMicrophoneSettings: () => Promise<void>
  permissionsOpenSpeechRecognitionSettings: () => Promise<void>

  // Data Export/Import
  dataExport: (options: ExportOptions) => Promise<boolean>
  dataImport: (options: ImportOptions) => Promise<ImportResult | null>

  // App
  appGetVersion: () => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
