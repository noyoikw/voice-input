import { ipcMain } from 'electron'
import { registerSpeechHandlers } from './speech'
import { registerGeminiHandlers } from './gemini'
import { registerHistoryHandlers } from './history'
import { registerSettingsHandlers } from './settings'
import { registerDictionaryHandlers } from './dictionary'
import { registerPromptsHandlers } from './prompts'
import { registerThemeHandlers } from './theme'
import { registerWindowHandlers } from './window'
import { registerPermissionsHandlers } from './permissions'

export function registerIpcHandlers(): void {
  registerSpeechHandlers()
  registerGeminiHandlers()
  registerHistoryHandlers()
  registerSettingsHandlers()
  registerDictionaryHandlers()
  registerPromptsHandlers()
  registerThemeHandlers()
  registerWindowHandlers()
  registerPermissionsHandlers()
}

export { ipcMain }
