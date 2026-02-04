import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDb } from '../../db'
import { settings, dictionary, prompts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { safeStorage } from 'electron'

let genAI: GoogleGenerativeAI | null = null

export function resetGenAI(): void {
  genAI = null
}

async function getApiKey(): Promise<string | null> {
  const db = getDb()
  const result = await db.select().from(settings).where(eq(settings.key, 'geminiApiKey')).limit(1)
  if (result.length === 0) return null

  try {
    const encrypted = Buffer.from(result[0].value, 'base64')
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

async function getGenAI(): Promise<GoogleGenerativeAI | null> {
  if (genAI) return genAI

  const apiKey = await getApiKey()
  if (!apiKey) return null

  genAI = new GoogleGenerativeAI(apiKey)
  return genAI
}

async function getDictionaryText(): Promise<string> {
  const db = getDb()
  const words = await db.select().from(dictionary)

  if (words.length === 0) return ''

  const lines = words.map((w) => `- ${w.reading} → ${w.display}`)
  return `## 単語帳（以下の読みは指定の表記に変換してください）\n${lines.join('\n')}`
}

async function getPromptContent(promptId?: number): Promise<string> {
  const db = getDb()

  let prompt
  if (promptId) {
    const result = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1)
    prompt = result[0]
  }

  if (!prompt) {
    // デフォルトプロンプトを取得
    const result = await db.select().from(prompts).where(eq(prompts.isDefault, true)).limit(1)
    prompt = result[0]
  }

  if (!prompt) {
    // フォールバック
    return `あなたは音声認識テキストを整形するアシスタントです。

【重要なルール】
- 入力されたテキストの意味を保持したまま、自然な日本語に整形してください
- 句読点を適切に挿入してください
- 明らかな言い間違いや認識ミスのみ修正してください
- 入力にない内容を追加しないでください
- 説明や補足を追加しないでください
- 整形後のテキストのみを出力してください

{{dictionary}}

入力: {{text}}

出力:`
  }

  return prompt.content
}

export interface RewriteResult {
  text: string
  isRewritten: boolean
}

export interface RewriteOptions {
  signal?: AbortSignal
}

// Node/Electron 互換の AbortError 生成（DOMException が存在しない環境対応）
function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export async function performRewrite(
  text: string,
  promptId?: number,
  options?: RewriteOptions
): Promise<RewriteResult> {
  // 既にキャンセルされている場合は即座に終了（APIキーチェックより前に配置）
  if (options?.signal?.aborted) {
    console.log('GeminiClient: Request already aborted')
    throw createAbortError('Rewrite cancelled')
  }

  const ai = await getGenAI()
  if (!ai) {
    console.log('GeminiClient: No API key, returning original text')
    return { text, isRewritten: false }
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })

    const dictionaryText = await getDictionaryText()
    let promptContent = await getPromptContent(promptId)

    // プレースホルダー置換
    promptContent = promptContent.replace('{{text}}', text)
    promptContent = promptContent.replace('{{dictionary}}', dictionaryText)

    // AbortSignal のサポート: Promise.race で実装
    const generatePromise = model.generateContent(promptContent)
    // abort 時に generatePromise の reject を吸収（未処理 reject 防止）
    generatePromise.catch(() => {})
    const signal = options?.signal

    let result
    if (signal) {
      // abort ハンドラを作成（後でクリーンアップできるように）
      let abortHandler: (() => void) | null = null
      const abortPromise = new Promise<never>((_, reject) => {
        abortHandler = () => reject(createAbortError('Rewrite cancelled'))
        signal.addEventListener('abort', abortHandler, { once: true })
        // レース条件対策: リスナー登録直後に再チェック（登録前に abort された場合に即 reject）
        if (signal.aborted) {
          reject(createAbortError('Rewrite cancelled'))
        }
      })

      // 未処理 reject を防ぐ（generatePromise が先に解決した後に abort された場合）
      abortPromise.catch(() => {})

      try {
        result = await Promise.race([generatePromise, abortPromise])
      } finally {
        // リスナーをクリーンアップ（常に実行してリーク防止）
        if (abortHandler) {
          signal.removeEventListener('abort', abortHandler)
        }
      }
    } else {
      result = await generatePromise
    }

    const response = result.response
    const rewrittenText = response.text().trim()

    return { text: rewrittenText || text, isRewritten: true }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('GeminiClient: Rewrite was cancelled')
      throw error
    }
    console.error('GeminiClient: Rewrite failed', error)
    throw error
  }
}
