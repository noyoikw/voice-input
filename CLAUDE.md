# Voice Input - Claude Code ガイド

## プロジェクト概要

macOS 向け高精度音声入力アプリケーション。Apple SFSpeechRecognizer と Google Gemini API を組み合わせ、Push-to-talk 方式で音声をテキストに変換し、LLM によるリライト後にアクティブアプリへ自動ペーストする。

## 技術スタック

- **フレームワーク**: Electron + React + TypeScript
- **ビルド**: electron-vite
- **スタイリング**: Tailwind CSS v4
- **データベース**: SQLite (better-sqlite3 + Drizzle ORM)
- **外部 API**: Google Gemini API (@google/generative-ai)
- **ネイティブ**: Swift Helper (音声認識、グローバルキー監視、HUD)

## 開発コマンド

詳細は [README.md](./README.md) を参照。

## 仕様

詳細は [SPEC.md](./SPEC.md) を参照。
