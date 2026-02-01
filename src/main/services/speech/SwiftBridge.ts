import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { SwiftMessage, MainToSwiftMessage, SpeechStatus, SwiftPermissions } from '../../../shared/types'

class SwiftBridge {
  private process: ChildProcess | null = null
  private currentSessionId: string | null = null
  private lastText = ''
  private status: SpeechStatus = 'idle'

  private statusChangeCallbacks: ((status: SpeechStatus) => void)[] = []
  private permissionsCallback: ((permissions: SwiftPermissions) => void) | null = null

  start(): void {
    if (this.process) {
      console.log('SwiftBridge: Already running')
      return
    }

    const helperPath = is.dev
      ? join(process.cwd(), 'resources', 'speech-helper')
      : join(process.resourcesPath, 'speech-helper')

    console.log('SwiftBridge: Starting helper at', helperPath)

    this.process = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.handleMessage(line)
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('SwiftBridge stderr:', data.toString())
    })

    this.process.on('error', (error) => {
      console.error('SwiftBridge: Failed to start helper', error)
      this.sendToRenderer('speech:error', { code: 'SPAWN_ERROR', message: error.message })
    })

    this.process.on('exit', (code, signal) => {
      console.log('SwiftBridge: Helper exited with code', code, 'signal', signal)
      this.process = null
    })

    // Handle stdin errors (EPIPE when process dies)
    this.process.stdin?.on('error', (err) => {
      console.warn('SwiftBridge: stdin error', err.message)
    })
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  private handleMessage(json: string): void {
    try {
      const message: SwiftMessage = JSON.parse(json)
      console.log('SwiftBridge: Received', message.type)

      switch (message.type) {
        case 'ready':
          console.log('SwiftBridge: Helper ready, mode:', message.text)
          // 保存されたホットキー設定を送信
          this.loadAndSendHotkey()
          break

        case 'started':
          this.currentSessionId = crypto.randomUUID()
          this.lastText = ''
          this.setStatus('recognizing')
          break

        case 'partial':
          this.lastText = message.text || ''
          this.sendToRenderer('speech:text', message.text, false)
          break

        case 'final':
          this.lastText = message.text || ''
          this.sendToRenderer('speech:text', message.text, true)
          break

        case 'stopped':
          // stoppedメッセージのテキストを使用（空文字列も含む）
          this.lastText = message.text ?? this.lastText
          // テキストが空の場合はリライトせずに終了し、HUDを閉じる
          if (!this.lastText.trim()) {
            this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })
            this.setStatus('idle')
            break
          }
          this.setStatus('rewriting')
          this.triggerRewrite()
          break

        case 'cancelled':
          console.log('SwiftBridge: Recording cancelled by user')
          this.lastText = ''
          this.setStatus('idle')
          break

        case 'level':
          this.sendToRenderer('speech:level', message.level)
          break

        case 'error':
          console.error('SwiftBridge: Error', message.code, message.message)
          this.sendToRenderer('speech:error', { code: message.code, message: message.message })
          this.setStatus('error')
          // エラー後は idle に戻る
          setTimeout(() => this.setStatus('idle'), 3000)
          break

        case 'permissions':
          if (message.permissions && this.permissionsCallback) {
            this.permissionsCallback(message.permissions)
            this.permissionsCallback = null
          }
          break
      }
    } catch (error) {
      console.error('SwiftBridge: Failed to parse message', json, error)
    }
  }

  private setStatus(status: SpeechStatus): void {
    this.status = status
    this.sendToRenderer('speech:status', status)
    for (const callback of this.statusChangeCallbacks) {
      callback(status)
    }
  }

  private async triggerRewrite(): Promise<void> {
    if (!this.lastText.trim()) {
      this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })
      this.setStatus('idle')
      return
    }

    this.sendToSwift({ type: 'rewrite:start', sessionId: this.currentSessionId || undefined })

    try {
      // アクティブアプリを検出し、対応するプロンプトを取得
      const { getActiveAppName } = await import('../activeApp/detector')
      const { getPromptForApp } = await import('./prompts')

      const appName = await getActiveAppName()
      const prompt = appName ? await getPromptForApp(appName) : null
      const promptId = prompt?.id

      // Gemini rewrite を呼び出す
      const { performRewrite } = await import('../gemini/GeminiClient')
      const rewriteResult = await performRewrite(this.lastText, promptId)

      this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })

      // クリップボードにコピーしてペースト
      const { pasteText } = await import('../clipboard/manager')
      await pasteText(rewriteResult.text)

      // 履歴に保存してレンダラーに通知
      const { saveHistory } = await import('./history')
      const historyEntry = await saveHistory(this.lastText, rewriteResult.text, rewriteResult.isRewritten, promptId)
      this.sendToRenderer('history:created', historyEntry)

      this.setStatus('completed')
      setTimeout(() => this.setStatus('idle'), 500)
    } catch (error) {
      console.error('SwiftBridge: Rewrite failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.sendToSwift({ type: 'rewrite:error', sessionId: this.currentSessionId || undefined, message: errorMessage })
      this.sendToRenderer('speech:error', { code: 'REWRITE_ERROR', message: errorMessage })
      this.setStatus('error')
      setTimeout(() => this.setStatus('idle'), 3000)
    }
  }

  private sendToSwift(message: MainToSwiftMessage): void {
    if (!this.process?.stdin || !this.process.stdin.writable) {
      console.warn('SwiftBridge: Cannot send to Swift, stdin not available')
      return
    }
    try {
      const json = JSON.stringify(message) + '\n'
      this.process.stdin.write(json, (err) => {
        if (err) {
          console.warn('SwiftBridge: Write error (process may have exited)', err.message)
        }
      })
    } catch (error) {
      console.warn('SwiftBridge: Failed to send message', error)
    }
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    const windows = BrowserWindow.getAllWindows()
    for (const window of windows) {
      window.webContents.send(channel, ...args)
    }
  }

  public setHotkey(hotkey: string): void {
    console.log('SwiftBridge: Setting hotkey to', hotkey)
    this.sendToSwift({ type: 'hotkey:set', hotkey })
  }

  private async loadAndSendHotkey(): Promise<void> {
    try {
      const { getDb } = await import('../../db')
      const { settings } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')

      const db = getDb()
      const result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'hotkey'))
        .limit(1)

      if (result.length > 0) {
        const hotkey = result[0].value
        this.setHotkey(hotkey)
      }
    } catch (error) {
      console.warn('SwiftBridge: Failed to load hotkey setting', error)
    }
  }

  onStatusChange(callback: (status: SpeechStatus) => void): void {
    this.statusChangeCallbacks.push(callback)
  }

  getLastText(): string {
    return this.lastText
  }

  getStatus(): SpeechStatus {
    return this.status
  }

  checkPermissions(): Promise<SwiftPermissions | null> {
    return new Promise((resolve) => {
      if (!this.process) {
        resolve(null)
        return
      }

      // タイムアウト設定（3秒）
      const timeout = setTimeout(() => {
        this.permissionsCallback = null
        resolve(null)
      }, 3000)

      this.permissionsCallback = (permissions) => {
        clearTimeout(timeout)
        resolve(permissions)
      }

      this.sendToSwift({ type: 'permissions:check' })
    })
  }
}

export const swiftBridge = new SwiftBridge()
