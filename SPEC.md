# Voice Input - 仕様書

macOS向け高精度音声入力アプリケーションの技術仕様書

## 1. 概要

### 1.1 製品概要

Voice Input は、Apple SFSpeechRecognizer と Google Gemini API を組み合わせた macOS 向け音声入力アプリケーションである。Push-to-talk 方式で音声をテキストに変換し、LLM によるリライト・整形を行った後、アクティブなアプリケーションに自動ペーストする。

### 1.2 主な特徴

- **ネイティブ音声認識**: Apple SFSpeechRecognizer によるオンデバイス日本語音声認識
- **LLMリライト**: Gemini Flash による自然な日本語への整形
- **Push-to-talk**: Control+Space キーによるグローバルホットキー操作
- **コンテキスト連動**: アクティブアプリに応じたプロンプト自動選択
- **履歴管理**: 音声入力履歴の検索・エクスポート機能

### 1.3 対象プラットフォーム

- macOS 13.0 (Ventura) 以上
- Apple Silicon (arm64) / Intel (x64) 対応

---

## 2. 機能要件

### 2.1 音声入力機能

| 機能 | 説明 |
|------|------|
| Push-to-talk録音 | Control+Space を押している間、音声を録音・認識 |
| リアルタイム認識 | 音声認識の途中結果をリアルタイム表示 |
| 音声レベル表示 | マイク入力レベルをHUDでビジュアル表示 |
| 自動停止 | キーリリース後 1 秒の遅延で録音停止（発話完了を待機） |
| リライト開始ディレイ | キーリリース時にHUDは即リライト表示、内部では 0.2 秒の入力保持後にリライト開始 |
| オンデバイス認識 | requiresOnDeviceRecognition = true でローカル処理（サーバー不使用） |

### 2.2 テキスト処理機能

| 機能 | 説明 |
|------|------|
| LLMリライト | 音声認識テキストを自然な日本語に整形 |
| カスタム辞書 | 読み→表記の変換ルールを適用 |
| プロンプトテンプレート | カスタマイズ可能なリライトプロンプト |
| アプリ連動プロンプト | アクティブアプリに応じたプロンプト自動選択 |

### 2.3 出力機能

| 機能 | 説明 |
|------|------|
| 自動ペースト | リライト後のテキストをアクティブアプリにペースト |
| クリップボード保護 | ペースト後に元のクリップボード内容を復元 |

### 2.4 履歴機能

| 機能 | 説明 |
|------|------|
| 履歴一覧 | 過去の音声入力履歴を時系列表示 |
| リアルタイム更新 | 音声入力完了時に履歴一覧を自動更新 |
| 検索 | 生テキスト・リライト後テキストで全文検索 |
| CSVエクスポート | 履歴データをCSV形式でエクスポート |
| 個別削除・一括クリア | 履歴の削除機能 |

### 2.5 設定機能

| 機能 | 説明 |
|------|------|
| Gemini APIキー | API認証キーの設定（暗号化保存） |
| ホットキー設定 | トリガーキーのカスタマイズ |
| テーマ | システム設定連動（ライト/ダーク/自動） |
| HUD外観 | サイズ・背景透明度・表示位置の調整 |

### 2.6 単語帳機能

| 機能 | 説明 |
|------|------|
| 単語登録 | 読み（ひらがな）と表記のペアを登録 |
| 一覧表示 | 登録済み単語の一覧・編集・削除 |
| リライト連携 | 登録単語をプロンプトに自動挿入 |

### 2.7 プロンプト管理機能

| 機能 | 説明 |
|------|------|
| プロンプト作成 | リライト用プロンプトテンプレートの作成 |
| プレースホルダー | `{{text}}` (入力テキスト), `{{dictionary}}` (辞書) |
| アプリパターン | 特定アプリでのみ使用するプロンプト設定 |
| デフォルト設定 | フォールバック用デフォルトプロンプト |

### 2.8 HUD機能

| 機能 | 説明 |
|------|------|
| 状態表示 | 録音中・処理中・エラーを視覚的に表示 |
| リライト中表示 | LLMリライト中のスピナー表示 |
| リライト即時表示 | キーリリース直後にスピナー表示へ即切替 |
| イコライザー表示 | 音声レベルを5本バーのイコライザー形式でアニメーション表示（モノトーン） |
| フローティング | 常に最前面、マウスイベント透過 |
| 全ワークスペース表示 | すべてのデスクトップスペースで表示 |

---

## 3. 非機能要件

### 3.1 パフォーマンス

| 項目 | 要件 |
|------|------|
| 音声認識レイテンシ | オンデバイス認識で低遅延（< 500ms） |
| リライト処理時間 | Gemini Flash による高速処理 |
| メモリ使用量 | アイドル時 100MB 以下 |

### 3.2 セキュリティ

| 項目 | 要件 |
|------|------|
| APIキー保護 | Electron safeStorage API + SQLite による暗号化保存 |
| IPC通信 | contextIsolation 有効、preload スクリプト経由 |
| サンドボックス | メインウィンドウは sandbox: false（native module 使用のため） |

### 3.3 ユーザビリティ

| 項目 | 要件 |
|------|------|
| 起動時間 | 3秒以内 |
| テーマ対応 | macOS システム設定に連動 |
| アクセシビリティ | キーボード操作完全対応 |

---

## 4. システムアーキテクチャ

### 4.1 プロセス構成

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├─────────────────────────────────────────────────────────────┤
│  Main Process (Node.js)                                      │
│  ├─ IPC Handlers (speech, gemini, history, settings, etc.) │
│  ├─ SQLite Database (better-sqlite3 + Drizzle ORM)          │
│  ├─ Gemini API Client (@google/generative-ai)               │
│  ├─ Clipboard Manager (Electron clipboard API)               │
│  ├─ Active App Detector (AppleScript via osascript)         │
│  └─ Theme Manager (nativeTheme)                              │
├─────────────────────────────────────────────────────────────┤
│  Renderer Process (React)                                    │
│  └─ Main Window: History, Settings, Dictionary, Prompts     │
├─────────────────────────────────────────────────────────────┤
│  Preload Script                                              │
│  └─ contextBridge: IPC API を window.electron に公開         │
├─────────────────────────────────────────────────────────────┤
│  Swift Helper (別プロセス)                                   │
│  ├─ SFSpeechRecognizer: 音声認識                            │
│  ├─ AVFoundation: オーディオキャプチャ                       │
│  ├─ CGEvent Tap: グローバルキー監視                          │
│  └─ Native HUD (SwiftUI + NSPanel)                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Swift Helper との通信

Electron Main Process と Swift Helper は標準入出力（stdin/stdout）を介した JSON メッセージで通信する。

**Swift Helper → Main Process メッセージ:**

| type | 説明 | 追加フィールド |
|------|------|----------------|
| `ready` | 初期化完了 | `text`: モード ("key-monitor" \| "stdin") |
| `started` | 録音開始 | - |
| `partial` | 部分認識結果 | `text`: 認識テキスト |
| `final` | 最終認識結果 | `text`: 認識テキスト |
| `stopped` | 録音停止 | `text`: 最終テキスト |
| `level` | 音声レベル | `level`: 0.0〜1.0 |
| `error` | エラー発生 | `code`, `message` |

**Main Process → Swift Helper メッセージ:**

| type | 説明 | 追加フィールド |
|------|------|----------------|
| `rewrite:start` | LLMリライト開始 | `sessionId` |
| `rewrite:done` | LLMリライト完了 | `sessionId` |
| `rewrite:error` | LLMリライト失敗 | `sessionId`, `message` |
| `hud:update` | HUD外観設定更新 | `size`, `opacity`, `position` |

### 4.3 データフロー

```
[Control+Space押下]
        ↓
[Swift Helper: 録音開始]
        ↓
[SFSpeechRecognizer: 音声認識]
        ↓ partial/final 結果
[Main Process: 状態管理]
        ↓
[HUD: リアルタイム表示]
        ↓
[Control+Space離す → 1秒遅延]
        ↓
[Swift Helper: 録音停止]
        ↓
[Main Process: Gemini リライト]
        ↓
[履歴保存 (SQLite)]
        ↓
[クリップボードにコピー → ペースト → クリップボード復元]
```

---

## 5. 技術スタック

### 5.1 アプリケーション基盤

| カテゴリ | ライブラリ | バージョン | 用途 |
|----------|------------|------------|------|
| フレームワーク | Electron | ^34.1.1 | クロスプラットフォームデスクトップアプリ |
| ビルドツール | electron-vite | ^3.0.0 | Vite ベースの Electron ビルド |
| パッケージング | electron-builder | ^25.1.8 | macOS アプリバンドル作成 |
| ユーティリティ | @electron-toolkit/utils | ^4.0.0 | Electron 開発補助 |
| ユーティリティ | @electron-toolkit/preload | ^3.0.1 | Preload スクリプト補助 |

### 5.2 フロントエンド

| カテゴリ | ライブラリ | バージョン | 用途 |
|----------|------------|------------|------|
| UIフレームワーク | React | ^19.0.0 | コンポーネントベースUI |
| 型システム | TypeScript | ^5.7.3 | 静的型付け |
| スタイリング | Tailwind CSS | ^4.0.0 | ユーティリティファーストCSS |
| ビルドツール | Vite | ^6.0.7 | フロントエンドバンドル |
| Reactプラグイン | @vitejs/plugin-react | ^4.3.4 | React Fast Refresh |

### 5.3 バックエンド / データ

| カテゴリ | ライブラリ | バージョン | 用途 |
|----------|------------|------------|------|
| データベース | better-sqlite3 | ^11.8.1 | SQLite ネイティブバインディング |
| ORM | drizzle-orm | ^0.39.1 | 型安全なデータベースアクセス |
| マイグレーション | drizzle-kit | ^0.30.4 | スキーママイグレーション |
| 設定ストア | electron-store | ^10.0.0 | 暗号化対応キーバリューストア |

### 5.4 外部API

| カテゴリ | ライブラリ | バージョン | 用途 |
|----------|------------|------------|------|
| LLM API | @google/generative-ai | ^0.21.0 | Gemini API クライアント |
| LLM モデル | gemini-2.0-flash-lite | - | 高速・低コストリライト |

### 5.5 Swift Helper

| カテゴリ | フレームワーク | 用途 |
|----------|----------------|------|
| 音声認識 | Speech (SFSpeechRecognizer) | 音声→テキスト変換 |
| オーディオ | AVFoundation (AVAudioEngine) | マイク入力キャプチャ |
| イベント | AppKit (CGEvent) | グローバルキー監視 |

**ビルド要件:**
- Swift 5.9+
- macOS 13.0+ SDK
- Xcode Command Line Tools

---

## 6. データモデル

### 6.1 テーブル定義

#### histories（音声入力履歴）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主キー |
| raw_text | TEXT | NOT NULL | 音声認識の生テキスト |
| rewritten_text | TEXT | NULLABLE | リライト後テキスト |
| app_name | TEXT | NULLABLE | 入力先アプリ名 |
| prompt_id | INTEGER | NULLABLE | 使用したプロンプトID |
| processing_time_ms | INTEGER | NULLABLE | 処理時間（ミリ秒） |
| created_at | TEXT | NOT NULL, DEFAULT | 作成日時（ローカル時刻） |

#### settings（アプリ設定）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| key | TEXT | PK | 設定キー |
| value | TEXT | NOT NULL | 設定値（JSON文字列） |

#### dictionary（単語帳）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主キー |
| reading | TEXT | NOT NULL | 読み（ひらがな） |
| display | TEXT | NOT NULL | 表記 |
| created_at | TEXT | NOT NULL, DEFAULT | 作成日時 |

#### prompts（プロンプトテンプレート）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主キー |
| name | TEXT | NOT NULL | プロンプト名 |
| content | TEXT | NOT NULL | プロンプト本文 |
| app_patterns | TEXT | NULLABLE | 対象アプリパターン（JSON配列） |
| is_default | INTEGER | NOT NULL, DEFAULT 0 | デフォルトフラグ |
| created_at | TEXT | NOT NULL, DEFAULT | 作成日時 |

#### voice_memos（ボイスメモ）※将来機能

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主キー |
| title | TEXT | NOT NULL | タイトル |
| raw_text | TEXT | NOT NULL | 認識テキスト |
| duration | INTEGER | NULLABLE | 録音時間（秒） |
| created_at | TEXT | NOT NULL, DEFAULT | 作成日時 |

### 6.2 データベースファイル配置

```
~/Library/Application Support/voice-input/
└── voice-input.db
```

---

## 7. IPC API 設計

### 7.1 Speech API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `speech:start` | invoke | 録音開始（レガシー） |
| `speech:stop` | invoke | 録音停止（レガシー） |
| `speech:text` | send | 認識テキスト通知 |
| `speech:error` | send | エラー通知 |
| `speech:status` | send | 状態変更通知 |
| `speech:level` | send | 音声レベル通知 |

### 7.2 Gemini API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `gemini:rewrite` | invoke | テキストリライト |
| `gemini:setApiKey` | invoke | APIキー設定 |
| `gemini:hasApiKey` | invoke | APIキー設定確認 |

### 7.3 History API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `history:list` | invoke | 履歴一覧取得 |
| `history:search` | invoke | 履歴検索 |
| `history:create` | invoke | 履歴作成 |
| `history:delete` | invoke | 履歴削除 |
| `history:clear` | invoke | 全履歴クリア |
| `history:exportCsv` | invoke | CSVエクスポート |

### 7.4 Settings API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `settings:get` | invoke | 設定値取得 |
| `settings:set` | invoke | 設定値保存 |
| `settings:getAll` | invoke | 全設定取得 |

### 7.5 Dictionary API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `dictionary:list` | invoke | 単語一覧取得 |
| `dictionary:create` | invoke | 単語作成 |
| `dictionary:update` | invoke | 単語更新 |
| `dictionary:delete` | invoke | 単語削除 |

### 7.6 Prompts API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `prompts:list` | invoke | プロンプト一覧取得 |
| `prompts:get` | invoke | プロンプト取得 |
| `prompts:create` | invoke | プロンプト作成 |
| `prompts:update` | invoke | プロンプト更新 |
| `prompts:delete` | invoke | プロンプト削除 |
| `prompts:getForApp` | invoke | アプリ用プロンプト取得 |

### 7.7 Theme API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `theme:get` | invoke | 現在のテーマ取得 |
| `theme:set` | invoke | テーマ設定 |
| `theme:changed` | send | テーマ変更通知 |

### 7.8 Window API

| チャネル | 方向 | 説明 |
|----------|------|------|
| `window:minimize` | send | ウィンドウ最小化 |
| `window:maximize` | send | ウィンドウ最大化 |
| `window:close` | send | ウィンドウクローズ |

---

## 8. 権限要件

### 8.1 macOS 権限

| 権限 | Info.plist キー | 用途 |
|------|-----------------|------|
| マイク | NSMicrophoneUsageDescription | 音声入力のためのマイクアクセス |
| 音声認識 | NSSpeechRecognitionUsageDescription | Apple音声認識サービスの利用 |
| Appleイベント | NSAppleEventsUsageDescription | 他アプリへのキーストローク送信 |
| アクセシビリティ | - | グローバルキー監視（システム設定で手動許可） |

### 8.2 アクセシビリティ権限

Swift Helper がグローバルキーイベントを監視するため、以下の許可が必要:

```
システム設定 > プライバシーとセキュリティ > アクセシビリティ
→ voice-input.app を許可
```

---

## 9. ウィンドウ仕様

### 9.1 メインウィンドウ

| 項目 | 値 |
|------|-----|
| 初期サイズ | 960 x 680 |
| 最小サイズ | 480 x 360 |
| タイトルバー | hiddenInset |
| trafficLightPosition | { x: 16, y: 12 } |
| vibrancy | sidebar |
| 背景色 | 透明 |

### 9.2 HUD ウィンドウ

| 項目 | 値 |
|------|-----|
| サイズ | 50 x 50 (固定) |
| 位置 | 画面中央 |
| 実装 | SwiftUI + NSPanel + NSHostingView |
| styleMask | borderless, nonactivatingPanel |
| transparent | true |
| level | floating |
| focusable | false |
| movable | false |
| material | ultraThinMaterial |
| マウス透過 | setIgnoresMouseEvents(true) |
| 全ワークスペース | setCollectionBehavior(.canJoinAllSpaces) |

---

## 10. 開発環境セットアップ

### 10.1 前提条件

- Node.js 20+
- pnpm 9+
- Xcode Command Line Tools
- Swift 5.9+

### 10.2 セットアップ手順

1. 依存関係インストール
2. Swift Helper ビルド（swift build -c release）
3. ビルド成果物を resources/ にコピー
4. 開発サーバー起動（pnpm dev）

### 10.3 ビルドコマンド

| コマンド | 説明 |
|----------|------|
| `pnpm dev` | 開発サーバー起動 |
| `pnpm build` | プロダクションビルド |
| `pnpm package` | macOS アプリパッケージング |
| `pnpm typecheck` | TypeScript 型チェック |

### 10.4 Swift Helper ビルド

```
cd swift-helper
swift build -c release
cp .build/release/speech-helper ../resources/
```

---

## 11. ディレクトリ構造

```
voice-input/
├── src/
│   ├── main/                    # Electron Main Process
│   │   ├── index.ts             # エントリーポイント
│   │   ├── db/                  # データベース
│   │   │   ├── index.ts         # DB初期化
│   │   │   └── schema.ts        # Drizzle スキーマ定義
│   │   ├── ipc/                 # IPCハンドラー
│   │   │   ├── index.ts         # ハンドラー登録
│   │   │   ├── speech.ts        # 音声認識IPC
│   │   │   ├── gemini.ts        # Gemini API IPC
│   │   │   ├── history.ts       # 履歴IPC
│   │   │   ├── settings.ts      # 設定IPC
│   │   │   ├── dictionary.ts    # 単語帳IPC
│   │   │   ├── prompts.ts       # プロンプトIPC
│   │   │   ├── theme.ts         # テーマIPC
│   │   │   └── window.ts        # ウィンドウIPC
│   │   ├── services/            # ビジネスロジック
│   │   │   ├── speech/          # 音声認識
│   │   │   │   └── SwiftBridge.ts
│   │   │   ├── gemini/          # LLM クライアント
│   │   │   │   └── GeminiClient.ts
│   │   │   ├── activeApp/       # アクティブアプリ検出
│   │   │   │   └── detector.ts
│   │   │   └── clipboard/       # クリップボード管理
│   │   │       └── manager.ts
│   │   ├── windows/             # ウィンドウ生成
│   │   │   ├── main.ts
│   │   │   └── hud.ts
│   │   └── utils/               # ユーティリティ
│   │       ├── hotkey.ts        # ホットキー管理
│   │       └── theme.ts         # テーマ管理
│   ├── preload/                 # Preload スクリプト
│   │   └── index.ts             # contextBridge API
│   ├── renderer/                # React UI
│   │   ├── main.tsx             # メインウィンドウエントリー
│   │   ├── hud.tsx              # HUDウィンドウエントリー
│   │   ├── App.tsx              # メインアプリコンポーネント
│   │   ├── components/          # UIコンポーネント
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Hud.tsx
│   │   │   └── icons.tsx
│   │   └── pages/               # ページコンポーネント
│   │       ├── History.tsx
│   │       ├── Settings.tsx
│   │       ├── Dictionary.tsx
│   │       └── Prompts.tsx
│   └── shared/                  # 共有型定義
│       └── types.ts
├── swift-helper/                # Swift ネイティブヘルパー
│   ├── Package.swift
│   └── Sources/
│       └── main.swift
├── resources/                   # 静的リソース
│   └── speech-helper            # ビルド済みSwiftバイナリ
├── drizzle.config.ts            # Drizzle設定
├── electron.vite.config.ts      # electron-vite設定
├── tsconfig.json                # TypeScript設定（共通）
├── tsconfig.node.json           # TypeScript設定（Node.js）
├── tsconfig.web.json            # TypeScript設定（Web）
└── package.json
```

---

## 12. 状態遷移

### 12.1 音声認識状態

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
     [idle] ──(Ctrl+Space押下)──> [recognizing]
        ▲                              │
        │                              │
        │              (Ctrl+Space離す)
        │                              │
        │                              ▼
        │                   [rewriting_pending]
        │                              │
        │                  (0.3秒経過)
        │                              │
        │                              ▼
        │                        [rewriting]
        │                              │
        │                       (リライト完了)
        │                              │
        └──────(ペースト完了)─────[completed]

                                       │
     [error] <────(エラー発生)─────────┘
        │
        └──────(自動復帰)──────> [idle]
```

### 12.2 状態定義

| 状態 | 説明 |
|------|------|
| idle | 待機中 |
| recognizing | 音声認識中 |
| rewriting_pending | リライト開始待機（HUDはリライト表示） |
| rewriting | LLMリライト中 |
| completed | 処理完了 |
| error | エラー発生 |

---

## 13. エラーハンドリング

### 13.1 エラーコード

| コード | 説明 | 対処 |
|--------|------|------|
| NOT_AUTHORIZED | 音声認識権限なし | 権限要求ダイアログ表示 |
| EVENT_TAP_FAILED | キー監視失敗 | アクセシビリティ権限案内 |
| START_ERROR | 録音開始失敗 | エラーログ・再試行 |
| RECOGNITION_ERROR | 認識エラー | フォールバック（生テキスト使用） |
| SPAWN_ERROR | Swiftヘルパー起動失敗 | ヘルパー再配置案内 |

### 13.2 Apple 一時エラー

Apple Speech Recognition API は一時的なサーバーエラー（error 209, 216）を返すことがある。これらは無視し、処理を継続する。

---

## 14. セキュリティ考慮事項

### 14.1 APIキー保護

- electron-store の暗号化機能を使用
- 暗号化キーはハードコード（改善余地あり）

### 14.2 IPC セキュリティ

- contextIsolation: true
- nodeIntegration: false
- preload スクリプトで明示的に API を公開

### 14.3 外部通信

- Gemini API: HTTPS 通信
- ローカル処理: SQLite, clipboard は完全ローカル

---

## 15. 将来の拡張ポイント

### 15.1 計画機能

- **ボイスメモ**: 長時間録音・テキスト化
- **ホットキーカスタマイズ**: UI からの変更
- **多言語対応**: 英語等の音声認識
- **モデル選択**: Gemini モデルの選択

### 15.2 アーキテクチャ拡張

- **プラグインシステム**: カスタムプロンプトプロセッサ
- **クラウド同期**: 設定・辞書の同期
- **ショートカットアプリ連携**: macOS ショートカット統合
