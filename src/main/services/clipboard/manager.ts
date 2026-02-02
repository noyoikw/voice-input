import { clipboard, NativeImage } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ClipboardData {
  text: string
  html: string
  rtf: string
  image: NativeImage | null
}

let savedClipboard: ClipboardData | null = null

export async function pasteText(text: string): Promise<void> {
  // 現在のクリップボードを保存（複数フォーマット対応）
  const image = clipboard.readImage()
  savedClipboard = {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: image.isEmpty() ? null : image,
  }

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
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (savedClipboard !== null) {
    if (savedClipboard.image) {
      // 画像がある場合は画像を復元
      clipboard.writeImage(savedClipboard.image)
    } else if (savedClipboard.html || savedClipboard.rtf) {
      // リッチテキストがある場合は複数フォーマットを復元
      clipboard.write({
        text: savedClipboard.text,
        html: savedClipboard.html,
        rtf: savedClipboard.rtf,
      })
    } else {
      // プレーンテキストのみの場合
      clipboard.writeText(savedClipboard.text)
    }
    savedClipboard = null
  }
}
