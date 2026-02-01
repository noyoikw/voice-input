import { contextBridge, ipcRenderer } from 'electron'
import type {
  ElectronAPI,
  HistoryEntry,
  Settings,
  SpeechStatus,
  ExportOptions,
  ImportOptions
} from '../shared/types'

const electronAPI: ElectronAPI = {
  // Speech
  onSpeechText: (callback) => {
    const handler = (_event: unknown, text: string, isFinal: boolean) => callback(text, isFinal)
    ipcRenderer.on('speech:text', handler)
    return () => ipcRenderer.removeListener('speech:text', handler)
  },
  onSpeechError: (callback) => {
    const handler = (_event: unknown, error: { code: string; message: string }) => callback(error)
    ipcRenderer.on('speech:error', handler)
    return () => ipcRenderer.removeListener('speech:error', handler)
  },
  onSpeechStatus: (callback) => {
    const handler = (_event: unknown, status: SpeechStatus) => callback(status)
    ipcRenderer.on('speech:status', handler)
    return () => ipcRenderer.removeListener('speech:status', handler)
  },
  onSpeechLevel: (callback) => {
    const handler = (_event: unknown, level: number) => callback(level)
    ipcRenderer.on('speech:level', handler)
    return () => ipcRenderer.removeListener('speech:level', handler)
  },

  // Gemini
  geminiRewrite: (text, promptId) => ipcRenderer.invoke('gemini:rewrite', text, promptId),
  geminiSetApiKey: (apiKey) => ipcRenderer.invoke('gemini:setApiKey', apiKey),
  geminiHasApiKey: () => ipcRenderer.invoke('gemini:hasApiKey'),
  geminiDeleteApiKey: () => ipcRenderer.invoke('gemini:deleteApiKey'),

  // History
  historyList: (limit, offset) => ipcRenderer.invoke('history:list', limit, offset),
  historySearch: (query) => ipcRenderer.invoke('history:search', query),
  historyCreate: (entry) => ipcRenderer.invoke('history:create', entry),
  historyDelete: (id) => ipcRenderer.invoke('history:delete', id),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  historyExportCsv: () => ipcRenderer.invoke('history:exportCsv'),
  onHistoryCreated: (callback) => {
    const handler = (_event: unknown, entry: HistoryEntry) => callback(entry)
    ipcRenderer.on('history:created', handler)
    return () => ipcRenderer.removeListener('history:created', handler)
  },

  // Settings
  settingsGet: <K extends keyof Settings>(key: K) => ipcRenderer.invoke('settings:get', key),
  settingsSet: <K extends keyof Settings>(key: K, value: Settings[K]) => ipcRenderer.invoke('settings:set', key, value),
  settingsGetAll: () => ipcRenderer.invoke('settings:getAll'),
  settingsGetAutoLaunch: () => ipcRenderer.invoke('settings:getAutoLaunch'),
  settingsSetAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('settings:setAutoLaunch', enabled),
  settingsOpenAutoLaunchSettings: () => ipcRenderer.invoke('settings:openAutoLaunchSettings'),

  // Dictionary
  dictionaryList: () => ipcRenderer.invoke('dictionary:list'),
  dictionaryCreate: (entry) => ipcRenderer.invoke('dictionary:create', entry),
  dictionaryUpdate: (id, entry) => ipcRenderer.invoke('dictionary:update', id, entry),
  dictionaryDelete: (id) => ipcRenderer.invoke('dictionary:delete', id),

  // Prompts
  promptsList: () => ipcRenderer.invoke('prompts:list'),
  promptsGet: (id) => ipcRenderer.invoke('prompts:get', id),
  promptsCreate: (entry) => ipcRenderer.invoke('prompts:create', entry),
  promptsUpdate: (id, entry) => ipcRenderer.invoke('prompts:update', id, entry),
  promptsDelete: (id) => ipcRenderer.invoke('prompts:delete', id),
  promptsGetForApp: (appName) => ipcRenderer.invoke('prompts:getForApp', appName),
  promptsRestoreDefault: (id) => ipcRenderer.invoke('prompts:restoreDefault', id),
  promptsListAppPatterns: () => ipcRenderer.invoke('prompts:listAppPatterns'),

  // Theme
  themeGet: () => ipcRenderer.invoke('theme:get'),
  themeSet: (theme) => ipcRenderer.invoke('theme:set', theme),
  onThemeChanged: (callback) => {
    const handler = (_event: unknown, theme: 'light' | 'dark') => callback(theme)
    ipcRenderer.on('theme:changed', handler)
    return () => ipcRenderer.removeListener('theme:changed', handler)
  },

  // Window
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  // Permissions
  permissionsCheck: () => ipcRenderer.invoke('permissions:check'),
  permissionsRequestAccessibility: () => ipcRenderer.invoke('permissions:requestAccessibility'),
  permissionsOpenAccessibilitySettings: () => ipcRenderer.invoke('permissions:openAccessibilitySettings'),
  permissionsOpenMicrophoneSettings: () => ipcRenderer.invoke('permissions:openMicrophoneSettings'),
  permissionsOpenSpeechRecognitionSettings: () => ipcRenderer.invoke('permissions:openSpeechRecognitionSettings'),

  // Data Export/Import
  dataExport: (options: ExportOptions) => ipcRenderer.invoke('data:export', options),
  dataImport: (options: ImportOptions) => ipcRenderer.invoke('data:import', options),

  // App
  appGetVersion: () => ipcRenderer.invoke('app:getVersion')
}

contextBridge.exposeInMainWorld('electron', electronAPI)
