# Voice Input - Claude Code ガイド

## プロジェクト概要

macOS向け高精度音声入力アプリケーション。Apple SFSpeechRecognizer と Google Gemini API を組み合わせ、Push-to-talk方式で音声をテキストに変換し、LLMによるリライト後にアクティブアプリへ自動ペーストする。

## 技術スタック

- **フレームワーク**: Electron + React + TypeScript
- **ビルド**: electron-vite
- **スタイリング**: Tailwind CSS v4
- **データベース**: SQLite (better-sqlite3 + Drizzle ORM)
- **外部API**: Google Gemini API (@google/generative-ai)
- **ネイティブ**: Swift Helper (音声認識、グローバルキー監視、HUD)

## ディレクトリ構造

```
src/
├── main/           # Electron Main Process
│   ├── db/         # SQLite + Drizzle
│   ├── ipc/        # IPC ハンドラー
│   ├── services/   # ビジネスロジック
│   └── windows/    # ウィンドウ管理
├── preload/        # Preload スクリプト
├── renderer/       # React UI
│   ├── components/ # UIコンポーネント
│   └── pages/      # ページ
└── shared/         # 共有型定義

swift-helper/       # Swift ネイティブヘルパー
resources/          # 静的リソース（ビルド済みSwiftバイナリ）
```

## 開発コマンド

```bash
pnpm dev          # 開発サーバー起動
pnpm build        # プロダクションビルド
pnpm package      # macOS アプリパッケージング
pnpm typecheck    # TypeScript 型チェック
```

## Swift Helper ビルド

```bash
cd swift-helper
swift build -c release
cp .build/release/speech-helper ../resources/
```

## アーキテクチャポイント

### プロセス間通信
- Main Process ↔ Renderer: Electron IPC (contextBridge経由)
- Main Process ↔ Swift Helper: stdin/stdout JSON メッセージ

### 状態遷移
idle → recognizing → rewriting_pending → rewriting → completed

### セキュリティ
- contextIsolation: true
- nodeIntegration: false
- APIキーは Electron safeStorage + SQLite で暗号化保存

## 重要な仕様

- **ホットキー**: Control (Push-to-talk) ※現在の実装
- **録音停止遅延**: キーリリース後 1秒
- **リライト開始遅延**: 0.2秒（音声認識結果の確定待ち）
- **音声認識**: オンデバイス認識 (requiresOnDeviceRecognition = true)
- **HUD**: SwiftUI + NSPanel + NSHostingView
  - サイズ: 50x50px
  - 録音中: 5本バーのイコライザー（モノトーン）
  - 変換中: 回転スピナー
- **履歴**: リアルタイム更新対応（IPC経由で自動反映）

## 依存関係のバージョン

主要なバージョン（package.json参照）:
- Electron: ^34.1.1
- React: ^19.0.0
- TypeScript: ^5.7.3
- Tailwind CSS: ^4.0.0
- better-sqlite3: ^11.8.1
- drizzle-orm: ^0.39.1
