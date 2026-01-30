import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let savedClipboard: string | null = null

export async function pasteText(text: string): Promise<void> {
  // 現在のクリップボードを保存
  savedClipboard = clipboard.readText()

  // テキストをクリップボードにセット
  clipboard.writeText(text)

  // 少し待ってからペースト（アプリがフォーカスを取り戻すのを待つ）
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Cmd+V をシミュレート
  try {
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`)
  } catch (error) {
    console.error('ClipboardManager: Paste failed', error)
    throw error
  }

  // クリップボードを復元
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (savedClipboard !== null) {
    clipboard.writeText(savedClipboard)
    savedClipboard = null
  }
}
