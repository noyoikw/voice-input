import { ipcMain, systemPreferences, shell } from 'electron'
import { swiftBridge } from '../services/speech/SwiftBridge'
import type { PermissionStatus } from '../../shared/types'

export function registerPermissionsHandlers(): void {
  ipcMain.handle('permissions:check', async (): Promise<PermissionStatus> => {
    // アクセシビリティ権限（Electron APIで確認）
    const accessibility = systemPreferences.isTrustedAccessibilityClient(false)

    // Swift Helperから音声認識・マイク権限を取得
    const swiftPermissions = await swiftBridge.checkPermissions()

    return {
      accessibility,
      microphone: swiftPermissions?.microphone ?? 'unknown',
      speechRecognition: swiftPermissions?.speechRecognition ?? 'unknown'
    }
  })

  ipcMain.handle('permissions:requestAccessibility', async (): Promise<boolean> => {
    // アクセシビリティ権限をリクエスト（システム設定を開く）
    const trusted = systemPreferences.isTrustedAccessibilityClient(true)
    return trusted
  })

  ipcMain.handle('permissions:openAccessibilitySettings', async (): Promise<void> => {
    // アクセシビリティ設定を開く
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  })

  ipcMain.handle('permissions:openMicrophoneSettings', async (): Promise<void> => {
    // マイク設定を開く
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
  })

  ipcMain.handle('permissions:openSpeechRecognitionSettings', async (): Promise<void> => {
    // 音声認識（音声入力）設定を開く - キーボード設定
    shell.openExternal('x-apple.systempreferences:com.apple.preference.keyboard?Dictation')
  })
}
