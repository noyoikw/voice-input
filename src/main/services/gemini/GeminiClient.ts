import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDb } from '../../db'
import { settings, dictionary, prompts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { safeStorage } from 'electron'

let genAI: GoogleGenerativeAI | null = null

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

export async function performRewrite(text: string, promptId?: number): Promise<string> {
  const ai = await getGenAI()
  if (!ai) {
    console.log('GeminiClient: No API key, returning original text')
    return text
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })

    const dictionaryText = await getDictionaryText()
    let promptContent = await getPromptContent(promptId)

    // プレースホルダー置換
    promptContent = promptContent.replace('{{text}}', text)
    promptContent = promptContent.replace('{{dictionary}}', dictionaryText)

    const result = await model.generateContent(promptContent)
    const response = result.response
    const rewrittenText = response.text().trim()

    return rewrittenText || text
  } catch (error) {
    console.error('GeminiClient: Rewrite failed', error)
    throw error
  }
}
