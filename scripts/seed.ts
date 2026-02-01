/**
 * シードデータ投入スクリプト
 *
 * 使い方:
 *   pnpm seed
 *
 * 注意: アプリを一度起動してデータベースを作成してから実行すること
 */

import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

// macOS の Application Support ディレクトリ
const userDataPath = join(
  homedir(),
  "Library",
  "Application Support",
  "voice-input",
);
const dbPath = join(userDataPath, "voice-input.db");

console.log("Database path:", dbPath);

let db: Database.Database;

try {
  db = new Database(dbPath);
} catch (error) {
  console.error(
    "データベースを開けませんでした。アプリを一度起動してから再実行してください。",
  );
  process.exit(1);
}

// プロンプトのシードデータ
const prompts = [
  {
    name: "コーディング",
    content: `以下の音声認識テキストを、プログラミングに関する文章として整形してください。

## ルール
- 技術用語は適切な英語表記にする（例: 関数→function, 変数→variable）
- キャメルケース、スネークケースなどの命名規則を文脈から推測して適用
- コードブロックが含まれる場合はマークダウン形式で整形
- 句読点を適切に挿入する
- 明らかな言い間違いを修正する

{{dictionary}}

## 入力テキスト
{{text}}

## 出力
整形後のテキストのみを出力してください。`,
    appPatterns: [
      "Code",
      "VSCode",
      "Cursor",
      "Terminal",
      "iTerm",
      "Warp",
      "ghostty",
      "Xcode",
    ],
    isDefault: false,
  },
  {
    name: "メール・ビジネス",
    content: `以下の音声認識テキストを、ビジネスメールに適した丁寧な文章に整形してください。

## ルール
- 敬語を適切に使用する
- 「お忙しいところ恐れ入りますが」などの定型表現を適宜追加
- 句読点を適切に挿入する
- 段落を適切に分ける
- 結びの言葉を追加する

{{dictionary}}

## 入力テキスト
{{text}}

## 出力
整形後のテキストのみを出力してください。`,
    appPatterns: ["Mail", "Outlook", "Gmail"],
    isDefault: false,
  },
  {
    name: "チャット・カジュアル",
    content: `以下の音声認識テキストを、チャットに適したカジュアルな文章に整形してください。

## ルール
- 話し言葉のニュアンスを維持する
- 句読点は最小限に
- 長文は短く区切る
- 絵文字は追加しない
- 意味を変えない

{{dictionary}}

## 入力テキスト
{{text}}

## 出力
整形後のテキストのみを出力してください。`,
    appPatterns: ["Slack", "Discord", "Messages", "LINE", "Telegram"],
    isDefault: false,
  },
  {
    name: "議事録・メモ",
    content: `以下の音声認識テキストを、議事録やメモに適した形式に整形してください。

## ルール
- 箇条書きを活用する
- 重要なポイントを明確にする
- 時系列や論理的な順序で整理する
- 冗長な表現を簡潔にする
- 句読点を適切に挿入する

{{dictionary}}

## 入力テキスト
{{text}}

## 出力
整形後のテキストのみを出力してください。`,
    appPatterns: ["Notion", "Obsidian", "Notes", "Bear", "Craft"],
    isDefault: false,
  },
];

// 単語帳のシードデータ
const dictionary = [
  // プログラミング用語
  { reading: "くろーど", display: "Claude" },
  { reading: "じぇみない", display: "Gemini" },
  { reading: "じーぴーてぃー", display: "GPT" },
  { reading: "おーぷんえーあい", display: "OpenAI" },
  { reading: "あんそろぴっく", display: "Anthropic" },
  { reading: "りあくと", display: "React" },
  { reading: "ねくすと", display: "Next.js" },
  { reading: "どっかー", display: "Docker" },
  { reading: "くばねてす", display: "Kubernetes" },
];

// プロンプトを挿入
console.log("\nプロンプトを挿入中...");
const insertPrompt = db.prepare(`
  INSERT OR IGNORE INTO prompts (name, content, is_default, created_at, updated_at)
  VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
`);
const insertPattern = db.prepare(`
  INSERT OR IGNORE INTO prompt_app_patterns (prompt_id, app_pattern)
  VALUES (?, ?)
`);

for (const prompt of prompts) {
  // 既存チェック
  const existing = db
    .prepare("SELECT id FROM prompts WHERE name = ?")
    .get(prompt.name) as { id: number } | undefined;
  if (existing) {
    console.log(`  スキップ: ${prompt.name}（既に存在）`);
    continue;
  }

  const result = insertPrompt.run(
    prompt.name,
    prompt.content,
    prompt.isDefault ? 1 : 0,
  );
  const promptId = result.lastInsertRowid as number;

  if (promptId && prompt.appPatterns) {
    for (const pattern of prompt.appPatterns) {
      insertPattern.run(promptId, pattern);
    }
  }

  console.log(`  追加: ${prompt.name}`);
}

// 単語帳を挿入
console.log("\n単語帳を挿入中...");
const insertWord = db.prepare(`
  INSERT INTO dictionary (reading, display, created_at)
  SELECT ?, ?, datetime('now', 'localtime')
  WHERE NOT EXISTS (
    SELECT 1 FROM dictionary WHERE reading = ? AND display = ?
  )
`);

let addedCount = 0;
let skippedCount = 0;

for (const word of dictionary) {
  const result = insertWord.run(
    word.reading,
    word.display,
    word.reading,
    word.display,
  );
  if (result.changes > 0) {
    addedCount++;
  } else {
    skippedCount++;
  }
}

console.log(`  追加: ${addedCount}件, スキップ: ${skippedCount}件（既に存在）`);

db.close();

console.log("\nシード完了!");
