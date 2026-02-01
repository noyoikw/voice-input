# Voice Input

macOS 向け高精度音声入力アプリケーション。Apple SFSpeechRecognizer と Google Gemini API を組み合わせ、Push-to-talk 方式で音声をテキストに変換し、LLM によるリライト後にアクティブアプリへ自動ペーストする。

## 必要な環境

- macOS 13.0 以上
- Node.js 20 以上
- pnpm
- Xcode Command Line Tools（Swift Helper ビルド用）
- Google Gemini API キー

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. Swift Helper のビルド

音声認識・グローバルホットキー・HUD 表示を担当するネイティブヘルパーをビルドする。

```bash
cd swift-helper
swift build -c release
cp .build/release/speech-helper ../resources/
cd ..
```

### 3. シードデータの投入（オプション）

初回起動前に、便利なプロンプトと単語帳のサンプルデータを投入できる。

```bash
pnpm seed
```

> **Note:** アプリを一度も起動していない場合、データベースが存在しないためエラーになる。その場合は先に `pnpm dev` でアプリを起動してから実行する。

## 開発

### 開発サーバー起動

```bash
pnpm dev
```

ホットリロードが有効な状態でアプリが起動する。

### 型チェック

```bash
pnpm typecheck
```

### リント

```bash
pnpm lint
```

## ビルド・パッケージング

### 1. プロダクションビルド

```bash
pnpm build
```

### 2. .app パッケージング

```bash
pnpm package
```

`dist/` ディレクトリに DMG ファイルが生成される。

> **Note:** Apple Silicon (arm64) と Intel (x64) の両方向けにビルドされる。

### 開発用ビルド（DMG なし）

```bash
pnpm package:dir
```

`dist/mac-arm64/` または `dist/mac-x64/` に .app ファイルが直接生成される。

## 初回起動時の設定

1. **Gemini API キー**: 設定画面で [Google AI Studio](https://aistudio.google.com/apikey) から取得した API キーを設定
2. **アクセシビリティ権限**: システム設定 > プライバシーとセキュリティ > アクセシビリティ で許可
3. **マイク権限**: 初回の音声入力時にダイアログが表示される
4. **音声認識権限**: 初回の音声入力時にダイアログが表示される

## 使い方

1. メニューバーのアイコンから起動
2. ホットキー（デフォルト: Fn）を押しながら話す
3. キーを離すと音声認識が完了し、Gemini でリライト
4. リライト結果がアクティブなアプリに自動ペーストされる

## ライセンス

MIT
