import { useState, useEffect, useRef, useCallback } from 'react'
import type { Settings as SettingsType, PermissionStatus } from '../../shared/types'

// e.code から表示名への変換
const codeToDisplayName: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Delete',
  Escape: 'Escape',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowDown: 'Down',
  ArrowUp: 'Up',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4',
  F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8',
  F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
}

// 修飾キーのcode
const modifierCodes = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight']

// fnキー単体で使用可能な選択肢
const fnKeyOption = 'Fn'

function Settings() {
  const [settings, setSettings] = useState<SettingsType>({})
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [pendingHotkey, setPendingHotkey] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null)
  const hotkeyButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    loadSettings()
    loadPermissions()

    // ウィンドウがフォーカスを得たときに権限を再チェック
    const handleFocus = () => {
      loadPermissions()
    }
    window.addEventListener('focus', handleFocus)

    // 5秒ごとにポーリング
    const intervalId = setInterval(loadPermissions, 5000)

    return () => {
      window.removeEventListener('focus', handleFocus)
      clearInterval(intervalId)
    }
  }, [])

  const loadPermissions = async () => {
    try {
      const status = await window.electron.permissionsCheck()
      // unknown の場合は前の状態を維持
      setPermissions(prev => ({
        accessibility: status.accessibility,
        microphone: status.microphone === 'unknown' ? (prev?.microphone ?? 'unknown') : status.microphone,
        speechRecognition: status.speechRecognition === 'unknown' ? (prev?.speechRecognition ?? 'unknown') : status.speechRecognition
      }))
    } catch (error) {
      console.error('Failed to load permissions:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const data = await window.electron.settingsGetAll()
      setSettings(data)
      const hasKey = await window.electron.geminiHasApiKey()
      setHasApiKey(hasKey)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return
    setIsSaving(true)
    try {
      await window.electron.geminiSetApiKey(apiKey)
      setApiKey('')
      setHasApiKey(true)
    } catch (error) {
      console.error('Failed to save API key:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleThemeChange = async (theme: 'system' | 'light' | 'dark') => {
    try {
      await window.electron.themeSet(theme)
      await window.electron.settingsSet('theme', theme)
      setSettings({ ...settings, theme })
    } catch (error) {
      console.error('Failed to set theme:', error)
    }
  }

  const handleHotkeyKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Escapeでキャンセル（修飾キーなしの場合のみ）
    if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      setIsRecordingHotkey(false)
      setPendingHotkey(null)
      return
    }

    // Returnで確定またはキャンセル（修飾キーなしの場合のみ）
    if (e.code === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      if (pendingHotkey) {
        saveHotkey(pendingHotkey)
      } else {
        // pendingHotkeyがない場合はキャンセル（Escと同じ挙動）
        setIsRecordingHotkey(false)
        setPendingHotkey(null)
      }
      return
    }

    // キーの組み合わせを構築
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Control')
    if (e.altKey) parts.push('Option')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Command')

    // 修飾キー以外のキーを追加
    if (!modifierCodes.includes(e.code)) {
      const keyName = codeToDisplayName[e.code] || e.code.replace(/^Key/, '').replace(/^Digit/, '')
      parts.push(keyName)
    }

    if (parts.length > 0) {
      setPendingHotkey(parts.join(' + '))
    }
  }, [pendingHotkey])

  const saveHotkey = async (hotkey: string) => {
    try {
      await window.electron.settingsSet('hotkey', hotkey)
      setSettings({ ...settings, hotkey })
      setIsRecordingHotkey(false)
      setPendingHotkey(null)
    } catch (error) {
      console.error('Failed to save hotkey:', error)
    }
  }

  const startRecordingHotkey = () => {
    setIsRecordingHotkey(true)
    setPendingHotkey(null)
    // 次のtickでフォーカス
    setTimeout(() => hotkeyButtonRef.current?.focus(), 0)
  }

  const currentHotkey = pendingHotkey || settings.hotkey || 'Control'

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-xl font-semibold">設定</h1>

        {/* Gemini API キー */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Gemini API</h2>
          <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">APIキー</label>
              {hasApiKey ? (
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400 text-sm">設定済み</span>
                  <button
                    onClick={() => setHasApiKey(false)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    変更
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSaveApiKey}
                    disabled={isSaving || !apiKey.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  Google AI Studio
                </a>
                でAPIキーを取得できます
              </p>
            </div>
          </div>
        </section>

        {/* テーマ */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">外観</h2>
          <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
            <label className="block text-sm font-medium mb-2">テーマ</label>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    settings.theme === theme || (!settings.theme && theme === 'system')
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600'
                  }`}
                >
                  {theme === 'system' ? 'システム' : theme === 'light' ? 'ライト' : 'ダーク'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ホットキー */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">ホットキー</h2>
          <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Push-to-talk</p>
                <p className="text-xs text-gray-500">音声入力を開始するキー</p>
              </div>
              <button
                ref={hotkeyButtonRef}
                onClick={startRecordingHotkey}
                onKeyDown={isRecordingHotkey ? handleHotkeyKeyDown : undefined}
                onBlur={() => {
                  if (isRecordingHotkey && !pendingHotkey) {
                    setIsRecordingHotkey(false)
                  }
                }}
                className={`px-3 py-1.5 rounded text-sm font-mono transition-colors min-w-[120px] text-center ${
                  isRecordingHotkey
                    ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                    : 'bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600'
                }`}
              >
                {isRecordingHotkey ? (pendingHotkey || 'キーを押す...') : currentHotkey}
              </button>
            </div>
            {isRecordingHotkey && (
              <p className="text-xs text-gray-500 mt-2">
                キーを押して選択、Returnで確定、Escでキャンセル
              </p>
            )}
            {/* fnキー選択用ボタン（ブラウザでは検出不可のため別途用意） */}
            {!isRecordingHotkey && currentHotkey !== fnKeyOption && (
              <div className="pt-2 border-t border-gray-200 dark:border-zinc-700">
                <button
                  onClick={() => saveHotkey(fnKeyOption)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  fnキーを使用する
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 権限 */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">権限</h2>
          <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg space-y-4">
            {/* アクセシビリティ権限 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">アクセシビリティ</p>
                <p className="text-xs text-gray-500">グローバルホットキーに必要</p>
              </div>
              <div className="flex items-center gap-3">
                {permissions?.accessibility ? (
                  <span className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    許可済み
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    未許可
                  </span>
                )}
                <button
                  onClick={() => window.electron.permissionsOpenAccessibilitySettings()}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  設定を開く
                </button>
              </div>
            </div>

            {/* マイク権限 */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-zinc-700">
              <div>
                <p className="text-sm font-medium">マイク</p>
                <p className="text-xs text-gray-500">音声認識に必要</p>
              </div>
              <div className="flex items-center gap-3">
                {permissions?.microphone === 'granted' ? (
                  <span className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    許可済み
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    未許可
                  </span>
                )}
                <button
                  onClick={() => window.electron.permissionsOpenMicrophoneSettings()}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  設定を開く
                </button>
              </div>
            </div>

            {/* 音声認識権限 */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-zinc-700">
              <div>
                <p className="text-sm font-medium">音声認識</p>
                <p className="text-xs text-gray-500">音声をテキストに変換するために必要</p>
              </div>
              <div className="flex items-center gap-3">
                {permissions?.speechRecognition === 'granted' ? (
                  <span className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    許可済み
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    未許可
                  </span>
                )}
                <button
                  onClick={() => window.electron.permissionsOpenSpeechRecognitionSettings()}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  設定を開く
                </button>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  )
}

export default Settings
