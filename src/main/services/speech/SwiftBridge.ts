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

  // セグメント蓄積用の状態
  private confirmedSegments: string[] = []  // 確定済みセグメント
  private lastUpdateTime: number | null = null  // 最後に partial/final を受け取った時刻
  private currentPartialText = ''  // 現在のセグメントの partial

  private static readonly SEGMENT_THRESHOLD_MS = 200  // 0.2秒

  private statusChangeCallbacks: ((status: SpeechStatus) => void)[] = []
  private permissionsCallback: ((permissions: SwiftPermissions) => void) | null = null

  // リライトキャンセル用
  private rewriteAbortController: AbortController | null = null
  private rewriteCancelled = false  // レース条件対策用フラグ

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
          this.confirmedSegments = []  // セッション開始時にリセット
          this.currentPartialText = ''
          this.lastUpdateTime = null
          this.lastText = ''
          this.setStatus('recognizing')
          break

        case 'partial': {
          const newPartial = message.text || ''
          const now = Date.now()

          // リセット検出: 新しい partial が前の partial の続きでない場合
          if (this.currentPartialText && newPartial) {
            const prevFirstChar = this.currentPartialText.charAt(0)
            const newFirstChar = newPartial.charAt(0)
            const firstCharChanged = prevFirstChar !== newFirstChar
            // 長さが30%以下に減少した場合もリセットとみなす
            // （同じ文字で始まる新しいセグメントが来た場合に対応）
            const significantlyShortened = newPartial.length < this.currentPartialText.length * 0.3

            if (firstCharChanged || significantlyShortened) {
              // しきい値以上経過していれば蓄積、未満なら言い直し
              if (this.lastUpdateTime && (now - this.lastUpdateTime) >= SwiftBridge.SEGMENT_THRESHOLD_MS) {
                // 追加発話: 前の partial を確定済みとして蓄積
                this.confirmedSegments.push(this.currentPartialText)
              }
              // 言い直しの場合は何もしない（前の partial は破棄される）
            }
          }

          this.currentPartialText = newPartial
          this.lastUpdateTime = now
          this.lastText = this.buildFullText()
          this.sendToRenderer('speech:text', this.lastText, false)
          break
        }

        case 'final': {
          const finalText = message.text || ''

          // final テキストを確定済みに追加
          // （partial でのリセット検出で過去のセグメントは既に追加済み）
          if (finalText) {
            this.confirmedSegments.push(finalText)
          }

          this.lastUpdateTime = Date.now()
          this.currentPartialText = ''
          this.lastText = this.buildFullText()
          this.sendToRenderer('speech:text', this.lastText, true)
          break
        }

        case 'stopped':
          // TypeScript側で蓄積した lastText を使用
          // （Swift からのテキストは使わない、final ハンドラで処理済み）
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

        case 'rewrite:cancelled':
          console.log('SwiftBridge: Rewrite cancelled by user (ESC)')
          this.cancelRewrite()
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

  private buildFullText(): string {
    const confirmed = this.confirmedSegments.join(' ')
    if (!this.currentPartialText) {
      return confirmed
    }
    return confirmed ? `${confirmed} ${this.currentPartialText}` : this.currentPartialText
  }

  private setStatus(status: SpeechStatus): void {
    this.status = status
    this.sendToRenderer('speech:status', status)
    for (const callback of this.statusChangeCallbacks) {
      callback(status)
    }
  }

  private async triggerRewrite(): Promise<void> {
    // フラグを冒頭でリセット（前回のキャンセル状態が残らないように）
    const wasCancelled = this.rewriteCancelled
    this.rewriteCancelled = false

    if (!this.lastText.trim()) {
      this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })
      this.setStatus('idle')
      return
    }

    // レース条件対策: triggerRewrite より先にキャンセルが来ていたら即終了
    if (wasCancelled) {
      console.log('SwiftBridge: Rewrite was already cancelled before starting')
      this.rewriteCancelled = false
      this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })
      this.setStatus('idle')
      return
    }

    // AbortController を作成
    this.rewriteAbortController = new AbortController()

    // レース条件対策: AbortController 作成後にもキャンセルフラグを再チェック
    // （フラグリセット後〜AbortController作成前にキャンセルが来た場合に対応）
    if (this.rewriteCancelled) {
      console.log('SwiftBridge: Rewrite was cancelled during setup')
      this.rewriteCancelled = false
      this.rewriteAbortController = null
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

      // Gemini rewrite を呼び出す（AbortSignal を渡す）
      const { performRewrite } = await import('../gemini/GeminiClient')
      const rewriteResult = await performRewrite(this.lastText, promptId, {
        signal: this.rewriteAbortController.signal
      })

      // キャンセルチェック: rewrite 成功後もキャンセルされていたら処理を中断
      if (this.rewriteAbortController?.signal.aborted) {
        console.log('SwiftBridge: Rewrite was cancelled after completion, skipping paste')
        this.rewriteAbortController = null
        this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })
        this.setStatus('idle')
        return
      }

      this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })

      // キャンセルチェック用のヘルパー
      const checkCancelled = (): boolean => {
        return this.rewriteAbortController?.signal.aborted ?? false
      }

      // クリップボードにコピーしてペースト
      if (checkCancelled()) {
        console.log('SwiftBridge: Cancelled before paste')
        this.rewriteAbortController = null
        this.setStatus('idle')
        return
      }
      const { pasteText } = await import('../clipboard/manager')
      await pasteText(rewriteResult.text)

      // 履歴に保存してレンダラーに通知
      if (checkCancelled()) {
        console.log('SwiftBridge: Cancelled before saving history')
        this.rewriteAbortController = null
        this.setStatus('idle')
        return
      }
      const { saveHistory } = await import('./history')
      const historyEntry = await saveHistory(this.lastText, rewriteResult.text, rewriteResult.isRewritten, promptId)
      this.sendToRenderer('history:created', historyEntry)

      // 全ての処理が完了してから AbortController をクリア
      this.rewriteAbortController = null
      this.setStatus('completed')
      setTimeout(() => this.setStatus('idle'), 500)
    } catch (error) {
      this.rewriteAbortController = null

      // キャンセルされた場合は特別な処理（name プロパティでチェック - Node/Electron 互換）
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('SwiftBridge: Rewrite was cancelled, returning to idle')
        this.sendToSwift({ type: 'rewrite:done', sessionId: this.currentSessionId || undefined })
        this.setStatus('idle')
        return
      }

      console.error('SwiftBridge: Rewrite failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.sendToSwift({ type: 'rewrite:error', sessionId: this.currentSessionId || undefined, message: errorMessage })
      this.sendToRenderer('speech:error', { code: 'REWRITE_ERROR', message: errorMessage })
      this.setStatus('error')
      setTimeout(() => this.setStatus('idle'), 3000)
    }
  }

  private cancelRewrite(): void {
    if (this.rewriteAbortController) {
      this.rewriteAbortController.abort()
      // 実際のクリーンアップは triggerRewrite の catch で行われる
    } else {
      // AbortController がまだ作られていない場合（レース条件）
      // フラグを立てて triggerRewrite で検出できるようにする
      // （rewrite:done 送信と状態更新は triggerRewrite 側で行う - 二重送信防止）
      this.rewriteCancelled = true
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
