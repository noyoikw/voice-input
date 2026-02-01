import { useState, useEffect, useMemo, useRef } from 'react'
import { PlusIcon, TrashIcon } from '../components/icons'
import PageHeader from '../components/PageHeader'
import { AppPatternTagInput } from '../components/AppPatternTagInput'
import type { PromptEntry, AppPatternInfo } from '../../shared/types'

function Prompts() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingPrompt, setEditingPrompt] = useState<PromptEntry | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [previewingPrompt, setPreviewingPrompt] = useState<PromptEntry | null>(null)

  // フォーム状態
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [appPatterns, setAppPatterns] = useState<string[]>([])
  const [allAppPatterns, setAllAppPatterns] = useState<AppPatternInfo[]>([])
  const [patternError, setPatternError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 成功メッセージを表示（3秒後に自動で消える）
  const showSuccess = (message: string) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    setSuccessMessage(message)
    successTimeoutRef.current = setTimeout(() => {
      setSuccessMessage(null)
    }, 3000)
  }

  useEffect(() => {
    loadPrompts()
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const loadPrompts = async () => {
    setIsLoading(true)
    try {
      const [data, patterns] = await Promise.all([
        window.electron.promptsList(),
        window.electron.promptsListAppPatterns()
      ])
      setPrompts(data)
      setAllAppPatterns(patterns)
    } catch (error) {
      console.error('Failed to load prompts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // デフォルトプロンプトの分類
  const { currentDefault, pastDefaults, customPrompts } = useMemo(() => {
    const defaults = prompts.filter((p) => p.isDefault)
    const customs = prompts.filter((p) => !p.isDefault)

    if (defaults.length === 0) {
      return { currentDefault: null, pastDefaults: [], customPrompts: customs }
    }

    // updatedAt でソート済み（APIから降順で返される）なので、最初が現在のデフォルト
    const [current, ...past] = defaults
    return { currentDefault: current, pastDefaults: past, customPrompts: customs }
  }, [prompts])

  // 初期表示でデフォルトプロンプトを選択
  useEffect(() => {
    if (!isLoading && currentDefault && !editingPrompt && !isCreating) {
      startEdit(currentDefault)
    }
  }, [isLoading, currentDefault])

  // フォームをリセットしてデフォルトに戻る
  const resetToDefault = () => {
    setPatternError(null)
    setNameError(null)
    setIsCreating(false)
    if (currentDefault) {
      setEditingPrompt(currentDefault)
      setName(currentDefault.name)
      setContent(currentDefault.content)
      setAppPatterns(currentDefault.appPatterns || [])
    } else {
      setEditingPrompt(null)
      setName('')
      setContent('')
      setAppPatterns([])
    }
  }

  const handleCreate = async () => {
    if (!name.trim() || !content.trim() || appPatterns.length === 0) return
    setPatternError(null)
    setNameError(null)
    try {
      const newPrompt = await window.electron.promptsCreate({
        name,
        content,
        appPatterns,
        isDefault: false
      })
      setPrompts([newPrompt, ...prompts])
      // パターン一覧を更新
      const patterns = await window.electron.promptsListAppPatterns()
      setAllAppPatterns(patterns)
      // 作成したプロンプトの編集画面に遷移
      setIsCreating(false)
      setEditingPrompt(newPrompt)
      showSuccess('作成しました')
    } catch (error) {
      // 重複エラーのハンドリング
      if (error instanceof Error && error.message.startsWith('APP_PATTERN_DUPLICATE:')) {
        const pattern = error.message.replace('APP_PATTERN_DUPLICATE:', '')
        setPatternError(`「${pattern}」は他のプロンプトで使用されています`)
      } else if (error instanceof Error && error.message.startsWith('PROMPT_NAME_DUPLICATE:')) {
        const duplicateName = error.message.replace('PROMPT_NAME_DUPLICATE:', '')
        setNameError(`「${duplicateName}」は既に使用されています`)
      } else {
        console.error('Failed to create prompt:', error)
      }
    }
  }

  const handleUpdate = async () => {
    if (!editingPrompt || !content.trim()) return
    // 通常プロンプトは名前・対象アプリ必須
    if (!editingPrompt.isDefault && (!name.trim() || appPatterns.length === 0)) return
    setPatternError(null)
    setNameError(null)

    try {
      let updated: PromptEntry
      if (editingPrompt.isDefault) {
        // デフォルトプロンプトは内容のみ更新
        updated = await window.electron.promptsUpdate(editingPrompt.id, {
          content
        })
      } else {
        // 通常プロンプトは全て更新可能
        updated = await window.electron.promptsUpdate(editingPrompt.id, {
          name,
          content,
          appPatterns
        })
      }
      setPrompts(prompts.map((p) => (p.id === editingPrompt.id ? updated : p)))
      setEditingPrompt(updated)
      // パターン一覧を更新
      const patterns = await window.electron.promptsListAppPatterns()
      setAllAppPatterns(patterns)
      showSuccess('保存しました')
    } catch (error) {
      // 重複エラーのハンドリング
      if (error instanceof Error && error.message.startsWith('APP_PATTERN_DUPLICATE:')) {
        const pattern = error.message.replace('APP_PATTERN_DUPLICATE:', '')
        setPatternError(`「${pattern}」は他のプロンプトで使用されています`)
      } else if (error instanceof Error && error.message.startsWith('PROMPT_NAME_DUPLICATE:')) {
        const duplicateName = error.message.replace('PROMPT_NAME_DUPLICATE:', '')
        setNameError(`「${duplicateName}」は既に使用されています`)
      } else {
        console.error('Failed to update prompt:', error)
      }
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('このプロンプトを削除しますか？')) return
    try {
      await window.electron.promptsDelete(id)
      const newPrompts = prompts.filter((p) => p.id !== id)
      setPrompts(newPrompts)
      // 削除後はデフォルトに戻る
      const newDefault = newPrompts.find((p) => p.isDefault)
      if (newDefault) {
        startEdit(newDefault)
      } else {
        setEditingPrompt(null)
        setName('')
        setContent('')
        setAppPatterns([])
      }
      showSuccess('削除しました')
    } catch (error) {
      console.error('Failed to delete prompt:', error)
    }
  }

  const handleRestoreDefault = async (id: number) => {
    try {
      const restored = await window.electron.promptsRestoreDefault(id)
      // リストを再読み込みしてソート順を更新
      await loadPrompts()
      setEditingPrompt(restored)
      setContent(restored.content)
      setPreviewingPrompt(null)
      showSuccess('復元しました')
    } catch (error) {
      console.error('Failed to restore default:', error)
    }
  }

  const handleDeletePastDefault = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation() // 親のクリックイベントを止める
    if (!confirm('この過去のデフォルトを削除しますか？')) return
    try {
      await window.electron.promptsDelete(id)
      setPrompts(prompts.filter((p) => p.id !== id))
      // プレビュー中のものを削除した場合はプレビューを解除
      if (previewingPrompt?.id === id) {
        setPreviewingPrompt(null)
      }
      showSuccess('削除しました')
    } catch (error) {
      console.error('Failed to delete past default:', error)
    }
  }

  const startEdit = (prompt: PromptEntry) => {
    setEditingPrompt(prompt)
    setName(prompt.name)
    setContent(prompt.content)
    setAppPatterns(prompt.appPatterns || [])
    setPatternError(null)
    setNameError(null)
    setIsCreating(false)
    setPreviewingPrompt(null)
  }

  const startCreate = () => {
    setEditingPrompt(null)
    setName('')
    setContent('')
    setAppPatterns([])
    setPatternError(null)
    setNameError(null)
    setIsCreating(true)
    setPreviewingPrompt(null)
  }

  const isEditing = editingPrompt !== null || isCreating
  const isEditingCurrentDefault = editingPrompt?.id === currentDefault?.id
  const isEditingPastDefault = editingPrompt?.isDefault && !isEditingCurrentDefault

  // 作成・保存ボタンの有効/無効判定
  const canSubmitCreate = name.trim() && content.trim() && appPatterns.length > 0
  const canSubmitUpdate = editingPrompt?.isDefault
    ? content.trim() // デフォルトプロンプトは内容のみ必須
    : name.trim() && content.trim() && appPatterns.length > 0

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="プロンプト" />

      <div className="flex-1 flex overflow-hidden">
        {/* プロンプトリスト */}
        <div className="w-64 border-r border-gray-200 dark:border-zinc-700 flex flex-col">
          <div className="flex-1 overflow-auto p-2">
          {isLoading ? (
            <div className="text-center text-gray-500 py-4 text-sm">読み込み中...</div>
          ) : prompts.length === 0 ? (
            <div className="text-center text-gray-500 py-4 text-sm">プロンプトがありません</div>
          ) : (
            <div className="space-y-1">
              {/* 現在のデフォルト */}
              {currentDefault && (
                <button
                  onClick={() => startEdit(currentDefault)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    editingPrompt?.id === currentDefault.id
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-medium text-sm">デフォルト</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                    未設定アプリに適用されます
                  </p>
                </button>
              )}
              {/* カスタムプロンプト */}
              {customPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => startEdit(prompt)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    editingPrompt?.id === prompt.id
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="font-medium text-sm truncate">{prompt.name}</div>
                  {prompt.appPatterns && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {prompt.appPatterns.join(', ')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 新規作成ボタン（下部固定） */}
        <div className="p-3 border-t border-gray-200 dark:border-zinc-700">
          <button
            onClick={startCreate}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
          >
            <PlusIcon className="w-4 h-4" />
            新規作成
          </button>
        </div>
      </div>

      {/* 編集エリア */}
      <div className="flex-1 flex flex-col">
        {isEditing ? (
          <>
            <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
              <h2 className="text-lg font-medium">
                {isCreating
                  ? '新規プロンプト'
                  : isEditingCurrentDefault
                    ? 'デフォルトプロンプト編集'
                    : isEditingPastDefault
                      ? '過去のデフォルト'
                      : 'プロンプト編集'}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* 過去のデフォルトの場合、復元案内を表示 */}
              {isEditingPastDefault && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    これは過去のデフォルトプロンプトです。編集するには復元が必要です。
                  </p>
                  <button
                    onClick={() => editingPrompt && handleRestoreDefault(editingPrompt.id)}
                    className="mt-2 px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600"
                  >
                    このプロンプトを復元
                  </button>
                </div>
              )}
              {/* 名前（デフォルト以外のみ） */}
              {!editingPrompt?.isDefault && (
                <div>
                  <label className="block text-sm font-medium mb-1">名前</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setNameError(null)
                    }}
                    className={`w-full px-3 py-2 bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 ${
                      nameError ? 'ring-2 ring-red-500' : 'focus:ring-blue-500'
                    }`}
                  />
                  {nameError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {nameError}
                    </p>
                  )}
                </div>
              )}
              {/* 対象アプリ（デフォルト以外・新規作成のみ） */}
              {!editingPrompt?.isDefault && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    対象アプリ
                  </label>
                  <AppPatternTagInput
                    value={appPatterns}
                    onChange={setAppPatterns}
                    allPatterns={allAppPatterns}
                    currentPromptId={editingPrompt?.id ?? null}
                  />
                  {patternError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {patternError}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">プロンプト</label>
                <textarea
                  value={previewingPrompt ? previewingPrompt.content : content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  disabled={isEditingPastDefault || previewingPrompt !== null}
                  className={`w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm disabled:cursor-not-allowed ${
                    previewingPrompt
                      ? 'bg-amber-50 dark:bg-amber-900/20'
                      : 'bg-gray-100 dark:bg-zinc-800 disabled:opacity-50'
                  }`}
                />
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                  <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">{'{{text}}'}</code> で原文、
                  <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded ml-1">{'{{dictionary}}'}</code> で辞書を参照できます
                </p>
              </div>
              {/* 過去のデフォルト（デフォルトプロンプト編集時のみ） */}
              {isEditingCurrentDefault && pastDefaults.length > 0 && (
                <div className="pt-2">
                  <p className="text-sm font-medium mb-2">
                    過去のデフォルト ({pastDefaults.length})
                  </p>
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {pastDefaults.map((prompt) => (
                      <div
                        key={prompt.id}
                        onClick={() => setPreviewingPrompt(prompt)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer group flex items-center justify-between ${
                          previewingPrompt?.id === prompt.id
                            ? 'bg-amber-100 dark:bg-amber-900/30'
                            : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-gray-600 dark:text-zinc-300">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                          <span className="text-sm">
                            {new Date(prompt.createdAt).toLocaleDateString('ja-JP')}
                            <span className="text-gray-400 dark:text-zinc-500 ml-1">
                              （最終更新：{new Date(prompt.updatedAt).toLocaleDateString('ja-JP')}）
                            </span>
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleDeletePastDefault(prompt.id, e)}
                          className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* フッター（過去のデフォルト以外） */}
            {!isEditingPastDefault && (
              <div className="p-3 border-t border-gray-200 dark:border-zinc-700 flex justify-between items-center">
                <div>
                  {/* 削除ボタン（デフォルト以外のみ、プレビュー中は非表示） */}
                  {editingPrompt && !editingPrompt.isDefault && !previewingPrompt && (
                    <button
                      onClick={() => handleDelete(editingPrompt.id)}
                      className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      削除
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {/* 成功メッセージ */}
                  {successMessage && (
                    <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {successMessage}
                    </span>
                  )}
                  {/* プレビュー中のボタン */}
                  {previewingPrompt ? (
                    <>
                      <button
                        onClick={() => setPreviewingPrompt(null)}
                        className="px-3 py-2 text-sm bg-gray-200 dark:bg-zinc-700 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => handleRestoreDefault(previewingPrompt.id)}
                        className="px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                      >
                        このバージョンを復元
                      </button>
                    </>
                  ) : (
                    <>
                      {/* キャンセルボタン（新規作成時のみ） */}
                      {isCreating && (
                        <button
                          onClick={resetToDefault}
                          className="px-3 py-2 text-sm bg-gray-200 dark:bg-zinc-700 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600"
                        >
                          キャンセル
                        </button>
                      )}
                      <button
                        onClick={isCreating ? handleCreate : handleUpdate}
                        disabled={isCreating ? !canSubmitCreate : !canSubmitUpdate}
                        className="px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500"
                      >
                        {isCreating ? '作成' : '保存'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            {isLoading ? '読み込み中...' : 'プロンプトがありません'}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

export default Prompts
