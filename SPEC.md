# Voice Input - 仕様書

macOS 向け高精度音声入力アプリケーションの技術仕様書

## 1. 概要

### 1.1 製品概要

Voice Input は、Apple SFSpeechRecognizer と Google Gemini API を組み合わせた macOS 向け音声入力アプリケーションである。Push-to-talk 方式で音声をテキストに変換し、LLM によるリライト・整形を行った後、アクティブなアプリケーションに自動ペーストする。

### 1.2 主な特徴

- **ネイティブ音声認識**: Apple SFSpeechRecognizer によるオンデバイス日本語音声認識
- **LLM リライト**: Gemini Flash による自然な日本語への整形
- **Push-to-talk**: Fn キーによるグローバルホットキー操作（カスタマイズ可能）
- **コンテキスト連動**: アクティブアプリに応じたプロンプト自動選択
- **履歴管理**: 音声入力履歴の検索・エクスポート機能

### 1.3 対象プラットフォーム

- macOS 13.0 (Ventura) 以上
- Apple Silicon (arm64) のみ対応

---

## 2. 機能要件

### 2.1 音声入力機能

| 機能              | 説明                                                                |
| ----------------- | ------------------------------------------------------------------- |
| Push-to-talk 録音 | ホットキー（デフォルト: Fn）を押している間、音声を録音・認識        |
| リアルタイム認識  | 音声認識の途中結果をリアルタイム表示                                |
| 音声レベル表示    | マイク入力レベルを HUD でビジュアル表示                             |
| 自動停止          | キーリリース後 0.3 秒の遅延で録音停止（発話完了を待機）             |
| 録音継続          | 停止遅延中にホットキーを再度押すと録音を継続（タイマーをキャンセル）|
| オンデバイス認識  | requiresOnDeviceRecognition = true でローカル処理（サーバー不使用） |
| セグメント蓄積    | silence 後の発話を蓄積または言い直しとして処理（下記参照）          |

#### セグメント蓄積機能

長い発話中に silence（無音）が発生すると、SFSpeechRecognizer は新しいセグメントを開始し、前の認識結果がリセットされる。この機能は、silence 後の発話を適切に処理する。

| 条件                          | 動作       | 説明                                   |
| ----------------------------- | ---------- | -------------------------------------- |
| 0.5秒以上の silence 後に発話  | 追加発話   | 前のテキストを確定し、新しいテキストを蓄積 |
| 0.5秒未満の silence 後に発話  | 言い直し   | 前のテキストを破棄し、新しいテキストで置換 |

**実装詳細:**
- partial イベントで最初の文字が変化したことを検出してセグメントリセットを判定
- 前回の更新時刻からの経過時間で「追加発話」か「言い直し」を判定
- 確定済みセグメントは空白区切りで結合

### 2.2 テキスト処理機能

| 機能                   | 説明                                       |
| ---------------------- | ------------------------------------------ |
| LLM リライト           | 音声認識テキストを自然な日本語に整形       |
| カスタム辞書           | 読み → 表記の変換ルールを適用              |
| プロンプトテンプレート | カスタマイズ可能なリライトプロンプト       |
| アプリ連動プロンプト   | アクティブアプリに応じたプロンプト自動選択 |

### 2.3 出力機能

| 機能               | 説明                                             |
| ------------------ | ------------------------------------------------ |
| 自動ペースト       | リライト後のテキストをアクティブアプリにペースト |
| クリップボード保護 | ペースト後に元のクリップボード内容を復元         |

### 2.4 履歴機能

| 機能                 | 説明                                     |
| -------------------- | ---------------------------------------- |
| 履歴一覧             | 過去の音声入力履歴を時系列表示           |
| リアルタイム更新     | 音声入力完了時に履歴一覧を自動更新       |
| 検索                 | 生テキスト・リライト後テキストで全文検索 |
| CSV エクスポート     | 履歴データを CSV 形式でエクスポート      |
| 個別削除・一括クリア | 履歴の削除機能                           |

### 2.5 設定機能

| 機能                   | 説明                                   |
| ---------------------- | -------------------------------------- |
| Gemini API キー        | API 認証キーの設定（暗号化保存）       |
| ホットキー設定         | トリガーキーのカスタマイズ             |
| テーマ                 | システム設定連動（ライト/ダーク/自動） |
| HUD 外観               | サイズ・背景透明度・表示位置の調整     |
| 自動起動               | ログイン時の自動起動設定（Mac設定と同期）|
| データエクスポート     | 設定・履歴・辞書・プロンプトの JSON 出力（選択項目のみ、未選択は null） |
| データインポート       | JSON ファイルからの復元（上書き/マージ、null データはスキップ、上書き時に警告表示） |

### 2.6 単語帳機能

| 機能         | 説明                                         |
| ------------ | -------------------------------------------- |
| 単語登録     | 読み（ひらがな）と表記のペアを登録           |
| 一覧表示     | 登録済み単語の一覧・編集・削除（固定幅レイアウト）|
| リライト連携 | 登録単語をプロンプトに自動挿入               |

### 2.7 プロンプト管理機能

| 機能               | 説明                                               |
| ------------------ | -------------------------------------------------- |
| プロンプト作成     | リライト用プロンプトテンプレートの作成             |
| プレースホルダー   | `{{text}}` (入力テキスト), `{{dictionary}}` (辞書) |
| アプリパターン     | 特定アプリでのみ使用するプロンプト設定             |
| デフォルト設定     | フォールバック用デフォルトプロンプト               |
| 過去バージョン管理 | 過去のデフォルトプロンプトの一覧表示・復元・削除   |

### 2.8 HUD 機能

| 機能                 | 説明                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| 状態表示             | 録音中・処理中・エラーを視覚的に表示                                      |
| リライト中表示       | LLM リライト中のスピナー表示                                              |
| リライト即時表示     | キーリリース直後にスピナー表示へ即切替                                    |
| イコライザー表示     | 音声レベルを 5 本バーのイコライザー形式でアニメーション表示（モノトーン） |
| フローティング       | 常に最前面、マウスイベント透過                                            |
| 全ワークスペース表示 | すべてのデスクトップスペースで表示                                        |

---

## 3. 非機能要件

### 3.1 パフォーマンス

| 項目               | 要件                                |
| ------------------ | ----------------------------------- |
| 音声認識レイテンシ | オンデバイス認識で低遅延（< 500ms） |
| リライト処理時間   | Gemini Flash による高速処理         |
| メモリ使用量       | アイドル時 100MB 以下               |

### 3.2 セキュリティ

| 項目           | 要件                                                          |
| -------------- | ------------------------------------------------------------- |
| API キー保護   | Electron safeStorage API + SQLite による暗号化保存            |
| IPC 通信       | contextIsolation 有効、preload スクリプト経由                 |
| サンドボックス | メインウィンドウは sandbox: false（native module 使用のため） |

### 3.3 ユーザビリティ

| 項目             | 要件                     |
| ---------------- | ------------------------ |
| 起動時間         | 3 秒以内                 |
| テーマ対応       | macOS システム設定に連動 |
| アクセシビリティ | キーボード操作完全対応   |

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

| type          | 説明         | 追加フィールド                                       |
| ------------- | ------------ | ---------------------------------------------------- |
| `ready`       | 初期化完了   | `text`: モード ("key-monitor" \| "stdin")            |
| `started`     | 録音開始     | -                                                    |
| `partial`     | 部分認識結果 | `text`: 認識テキスト                                 |
| `final`       | 最終認識結果 | `text`: 認識テキスト                                 |
| `stopped`     | 録音停止     | `text`: 最終テキスト                                 |
| `cancelled`   | 録音キャンセル | -                                                  |
| `level`       | 音声レベル   | `level`: 0.0〜1.0                                    |
| `error`       | エラー発生   | `code`, `message`                                    |
| `permissions` | 権限状態     | `permissions`: { speechRecognition, microphone }     |

**Main Process → Swift Helper メッセージ:**

| type                | 説明             | 追加フィールド                |
| ------------------- | ---------------- | ----------------------------- |
| `rewrite:start`     | LLM リライト開始 | `sessionId`                   |
| `rewrite:done`      | LLM リライト完了 | `sessionId`                   |
| `rewrite:error`     | LLM リライト失敗 | `sessionId`, `message`        |
| `hud:update`        | HUD 外観設定更新 | `size`, `opacity`, `position` |
| `hotkey:set`        | ホットキー変更   | `hotkey`                      |
| `permissions:check` | 権限状態確認要求 | -                             |

### 4.3 データフロー

```
[ホットキー押下]
        ↓
[Swift Helper: 録音開始]
        ↓
[SFSpeechRecognizer: 音声認識]
        ↓ partial/final 結果
[Main Process: 状態管理]
        ↓
[HUD: リアルタイム表示]
        ↓
[ホットキー離す → 0.3秒遅延]
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

## 5. データモデル

### 5.1 テーブル定義

#### histories（音声入力履歴）

| カラム             | 型      | 制約               | 説明                                   |
| ------------------ | ------- | ------------------ | -------------------------------------- |
| id                 | INTEGER | PK, AUTO INCREMENT | 主キー                                 |
| raw_text           | TEXT    | NOT NULL           | 音声認識の生テキスト                   |
| rewritten_text     | TEXT    | NULLABLE           | リライト後テキスト                     |
| is_rewritten       | INTEGER | NOT NULL, DEFAULT 0| リライト実行フラグ（API キー設定時に 1）|
| app_name           | TEXT    | NULLABLE           | 入力先アプリ名                         |
| prompt_id          | INTEGER | NULLABLE           | 使用したプロンプト ID                  |
| processing_time_ms | INTEGER | NULLABLE           | 処理時間（ミリ秒）                     |
| created_at         | TEXT    | NOT NULL, DEFAULT  | 作成日時（ローカル時刻）               |

#### settings（アプリ設定）

| カラム | 型   | 制約     | 説明                  |
| ------ | ---- | -------- | --------------------- |
| key    | TEXT | PK       | 設定キー              |
| value  | TEXT | NOT NULL | 設定値（JSON 文字列） |

#### dictionary（単語帳）

| カラム     | 型      | 制約               | 説明             |
| ---------- | ------- | ------------------ | ---------------- |
| id         | INTEGER | PK, AUTO INCREMENT | 主キー           |
| reading    | TEXT    | NOT NULL           | 読み（ひらがな） |
| display    | TEXT    | NOT NULL           | 表記             |
| created_at | TEXT    | NOT NULL, DEFAULT  | 作成日時         |

#### prompts（プロンプトテンプレート）

| カラム       | 型      | 制約                | 説明                                    |
| ------------ | ------- | ------------------- | --------------------------------------- |
| id           | INTEGER | PK, AUTO INCREMENT  | 主キー                                  |
| name         | TEXT    | NOT NULL            | プロンプト名                            |
| content      | TEXT    | NOT NULL            | プロンプト本文                          |
| app_patterns | TEXT    | NULLABLE            | 対象アプリパターン（JSON 配列）※未使用 |
| is_default   | INTEGER | NOT NULL, DEFAULT 0 | デフォルトフラグ                        |
| created_at   | TEXT    | NOT NULL, DEFAULT   | 作成日時                                |
| updated_at   | TEXT    | NOT NULL, DEFAULT   | 更新日時                                |

#### prompt_app_patterns（プロンプト対象アプリパターン）

| カラム      | 型      | 制約                         | 説明                   |
| ----------- | ------- | ---------------------------- | ---------------------- |
| id          | INTEGER | PK, AUTO INCREMENT           | 主キー                 |
| prompt_id   | INTEGER | NOT NULL, FK → prompts.id    | プロンプト ID          |
| app_pattern | TEXT    | NOT NULL, UNIQUE             | アプリパターン文字列   |

※ prompts.app_patterns（JSON カラム）は廃止予定。prompt_app_patterns テーブルを使用。

#### voice_memos（ボイスメモ）※将来機能

| カラム     | 型      | 制約               | 説明           |
| ---------- | ------- | ------------------ | -------------- |
| id         | INTEGER | PK, AUTO INCREMENT | 主キー         |
| title      | TEXT    | NOT NULL           | タイトル       |
| raw_text   | TEXT    | NOT NULL           | 認識テキスト   |
| duration   | INTEGER | NULLABLE           | 録音時間（秒） |
| created_at | TEXT    | NOT NULL, DEFAULT  | 作成日時       |

### 5.2 データベースファイル配置

```
~/Library/Application Support/voice-input/
└── voice-input.db
```

---

## 6. IPC API 設計

### 6.1 Speech API

| チャネル        | 方向   | 説明                 |
| --------------- | ------ | -------------------- |
| `speech:start`  | invoke | 録音開始（レガシー） |
| `speech:stop`   | invoke | 録音停止（レガシー） |
| `speech:text`   | send   | 認識テキスト通知     |
| `speech:error`  | send   | エラー通知           |
| `speech:status` | send   | 状態変更通知         |
| `speech:level`  | send   | 音声レベル通知       |

### 6.2 Gemini API

| チャネル           | 方向   | 説明             |
| ------------------ | ------ | ---------------- |
| `gemini:rewrite`   | invoke | テキストリライト |
| `gemini:setApiKey` | invoke | API キー設定     |
| `gemini:hasApiKey` | invoke | API キー設定確認 |

### 6.3 History API

| チャネル            | 方向   | 説明                 |
| ------------------- | ------ | -------------------- |
| `history:list`      | invoke | 履歴一覧取得         |
| `history:search`    | invoke | 履歴検索             |
| `history:create`    | invoke | 履歴作成             |
| `history:delete`    | invoke | 履歴削除             |
| `history:clear`     | invoke | 全履歴クリア         |
| `history:exportCsv` | invoke | CSV エクスポート     |
| `history:created`   | send   | 履歴作成通知（IPC）  |

### 6.4 Settings API

| チャネル                       | 方向   | 説明                         |
| ------------------------------ | ------ | ---------------------------- |
| `settings:get`                 | invoke | 設定値取得                   |
| `settings:set`                 | invoke | 設定値保存                   |
| `settings:getAll`              | invoke | 全設定取得                   |
| `settings:getAutoLaunch`       | invoke | 自動起動取得                 |
| `settings:setAutoLaunch`       | invoke | 自動起動設定                 |
| `settings:openAutoLaunchSettings` | invoke | macOS ログイン項目設定を開く |
| `app:getVersion`               | invoke | アプリバージョン取得         |

### 6.5 Dictionary API

| チャネル            | 方向   | 説明         |
| ------------------- | ------ | ------------ |
| `dictionary:list`   | invoke | 単語一覧取得 |
| `dictionary:create` | invoke | 単語作成     |
| `dictionary:update` | invoke | 単語更新     |
| `dictionary:delete` | invoke | 単語削除     |

### 6.6 Prompts API

| チャネル                  | 方向   | 説明                     |
| ------------------------- | ------ | ------------------------ |
| `prompts:list`            | invoke | プロンプト一覧取得       |
| `prompts:get`             | invoke | プロンプト取得           |
| `prompts:create`          | invoke | プロンプト作成           |
| `prompts:update`          | invoke | プロンプト更新           |
| `prompts:delete`          | invoke | プロンプト削除           |
| `prompts:getForApp`       | invoke | アプリ用プロンプト取得   |
| `prompts:restoreDefault`  | invoke | デフォルト復元           |
| `prompts:listAppPatterns` | invoke | アプリパターン一覧取得   |

### 6.7 Theme API

| チャネル        | 方向   | 説明             |
| --------------- | ------ | ---------------- |
| `theme:get`     | invoke | 現在のテーマ取得 |
| `theme:set`     | invoke | テーマ設定       |
| `theme:changed` | send   | テーマ変更通知   |

### 6.8 Window API

| チャネル          | 方向 | 説明               |
| ----------------- | ---- | ------------------ |
| `window:minimize` | send | ウィンドウ最小化   |
| `window:maximize` | send | ウィンドウ最大化   |
| `window:close`    | send | ウィンドウクローズ |

### 6.9 Permissions API

| チャネル                               | 方向   | 説明                           |
| -------------------------------------- | ------ | ------------------------------ |
| `permissions:check`                    | invoke | 権限状態確認                   |
| `permissions:requestAccessibility`     | invoke | アクセシビリティ権限要求       |
| `permissions:openAccessibilitySettings`| invoke | アクセシビリティ設定を開く     |
| `permissions:openMicrophoneSettings`   | invoke | マイク設定を開く               |
| `permissions:openSpeechRecognitionSettings` | invoke | 音声認識設定を開く        |

### 6.10 Data Export/Import API

| チャネル       | 方向   | 説明                               |
| -------------- | ------ | ---------------------------------- |
| `data:export`  | invoke | データエクスポート（JSON ファイル）|
| `data:import`  | invoke | データインポート（JSON ファイル）  |

**エクスポート仕様:**
- ファイル名形式: `voice-input-data-YYYYMMDDHHMMSS.json`（JST）
- 選択項目のみデータを出力、未選択項目は `null` として出力
- API キーはエクスポートに含まれない

**インポート仕様:**
- マージモード: 既存データに追加（重複はスキップ）
- 上書きモード: 既存データを削除して置換（警告ダイアログを表示）
- データが `null` の項目は、チェック状態に関係なくスキップ（既存データを維持）

---

## 7. 権限要件

### 7.1 macOS 権限

| 権限             | Info.plist キー                     | 用途                                         |
| ---------------- | ----------------------------------- | -------------------------------------------- |
| マイク           | NSMicrophoneUsageDescription        | 音声入力のためのマイクアクセス               |
| 音声認識         | NSSpeechRecognitionUsageDescription | Apple 音声認識サービスの利用                 |
| Apple イベント   | NSAppleEventsUsageDescription       | 他アプリへのキーストローク送信               |
| アクセシビリティ | -                                   | グローバルキー監視（システム設定で手動許可） |

### 7.2 アクセシビリティ権限

Swift Helper がグローバルキーイベントを監視するため、以下の許可が必要:

```
システム設定 > プライバシーとセキュリティ > アクセシビリティ
→ voice-input.app を許可
```

---

## 8. ウィンドウ仕様

### 8.1 メインウィンドウ

| 項目                 | 値               |
| -------------------- | ---------------- |
| 初期サイズ           | 960 x 680        |
| 最小サイズ           | 480 x 360        |
| タイトルバー         | hiddenInset      |
| trafficLightPosition | { x: 16, y: 12 } |
| vibrancy             | sidebar          |
| 背景色               | 透明             |

### 8.2 HUD ウィンドウ

| 項目             | 値                                       |
| ---------------- | ---------------------------------------- |
| サイズ           | 50 x 50 (固定)                           |
| 位置             | 画面中央                                 |
| 実装             | SwiftUI + NSPanel + NSHostingView        |
| styleMask        | borderless, nonactivatingPanel           |
| transparent      | true                                     |
| level            | floating                                 |
| focusable        | false                                    |
| movable          | false                                    |
| material         | ultraThinMaterial                        |
| マウス透過       | setIgnoresMouseEvents(true)              |
| 全ワークスペース | setCollectionBehavior(.canJoinAllSpaces) |

---

## 9. 状態遷移

### 9.1 音声認識状態

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
     [idle] ──(ホットキー押下)──> [recognizing]
        ▲                              │
        │                              │
        │              (ホットキー離す)
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

### 9.2 状態定義

| 状態        | 説明           |
| ----------- | -------------- |
| idle        | 待機中         |
| recognizing | 音声認識中     |
| rewriting   | LLM リライト中 |
| completed   | 処理完了       |
| error       | エラー発生     |

---

## 10. エラーハンドリング

### 10.1 エラーコード

| コード            | 説明                   | 対処                             |
| ----------------- | ---------------------- | -------------------------------- |
| NOT_AUTHORIZED    | 音声認識権限なし       | 権限要求ダイアログ表示           |
| EVENT_TAP_FAILED  | キー監視失敗           | アクセシビリティ権限案内         |
| START_ERROR       | 録音開始失敗           | エラーログ・再試行               |
| RECOGNITION_ERROR | 認識エラー             | フォールバック（生テキスト使用） |
| SPAWN_ERROR       | Swift ヘルパー起動失敗 | ヘルパー再配置案内               |

### 10.2 Apple 一時エラー

Apple Speech Recognition API は一時的なサーバーエラー（error 209, 216）を返すことがある。これらは無視し、処理を継続する。

---

## 11. セキュリティ考慮事項

### 11.1 API キー保護

- Electron safeStorage API を使用してキーチェーンに暗号化保存
- 暗号化された値は SQLite の settings テーブルに格納

### 11.2 IPC セキュリティ

- contextIsolation: true
- nodeIntegration: false
- preload スクリプトで明示的に API を公開

### 11.3 外部通信

- Gemini API: HTTPS 通信
- ローカル処理: SQLite, clipboard は完全ローカル

---

## 12. 将来の拡張ポイント

- **ボイスメモ**: 長時間録音・テキスト化
- **多言語対応**: 英語等の音声認識
- **モデル選択**: Gemini モデルの選択
- **プラグインシステム**: カスタムプロンプトプロセッサ
- **クラウド同期**: 設定・辞書の同期
- **ショートカットアプリ連携**: macOS ショートカット統合
