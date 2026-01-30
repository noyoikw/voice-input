import { useState, useEffect } from 'react'
import { PlusIcon } from '../components/icons'
import type { PromptEntry } from '../../shared/types'

function Prompts() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingPrompt, setEditingPrompt] = useState<PromptEntry | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // フォーム状態
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [appPatterns, setAppPatterns] = useState('')

  useEffect(() => {
    loadPrompts()
  }, [])

  const loadPrompts = async () => {
    setIsLoading(true)
    try {
      const data = await window.electron.promptsList()
      setPrompts(data)
    } catch (error) {
      console.error('Failed to load prompts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setName('')
    setContent('')
    setAppPatterns('')
    setEditingPrompt(null)
    setIsCreating(false)
  }

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) return
    try {
      const patterns = appPatterns.trim()
        ? appPatterns.split(',').map((p) => p.trim()).filter(Boolean)
        : null
      const newPrompt = await window.electron.promptsCreate({
        name,
        content,
        appPatterns: patterns,
        isDefault: false
      })
      setPrompts([newPrompt, ...prompts])
      resetForm()
    } catch (error) {
      console.error('Failed to create prompt:', error)
    }
  }

  const handleUpdate = async () => {
    if (!editingPrompt || !content.trim()) return
    // 通常プロンプトは名前必須
    if (!editingPrompt.isDefault && !name.trim()) return

    try {
      if (editingPrompt.isDefault) {
        // デフォルトプロンプトは内容のみ更新
        const updated = await window.electron.promptsUpdate(editingPrompt.id, {
          content
        })
        setPrompts(prompts.map((p) => (p.id === editingPrompt.id ? updated : p)))
      } else {
        // 通常プロンプトは全て更新可能
        const patterns = appPatterns.trim()
          ? appPatterns.split(',').map((p) => p.trim()).filter(Boolean)
          : null
        const updated = await window.electron.promptsUpdate(editingPrompt.id, {
          name,
          content,
          appPatterns: patterns
        })
        setPrompts(prompts.map((p) => (p.id === editingPrompt.id ? updated : p)))
      }
      resetForm()
    } catch (error) {
      console.error('Failed to update prompt:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('このプロンプトを削除しますか？')) return
    try {
      await window.electron.promptsDelete(id)
      setPrompts(prompts.filter((p) => p.id !== id))
      resetForm()
    } catch (error) {
      console.error('Failed to delete prompt:', error)
    }
  }

  const startEdit = (prompt: PromptEntry) => {
    setEditingPrompt(prompt)
    setName(prompt.name)
    setContent(prompt.content)
    setAppPatterns(prompt.appPatterns?.join(', ') || '')
    setIsCreating(false)
  }

  const startCreate = () => {
    resetForm()
    setIsCreating(true)
  }

  const isEditing = editingPrompt !== null || isCreating
  const isEditingDefault = editingPrompt?.isDefault ?? false

  return (
    <div className="h-full flex">
      {/* プロンプトリスト */}
      <div className="w-64 border-r border-gray-200 dark:border-zinc-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
          <button
            onClick={startCreate}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
          >
            <PlusIcon className="w-4 h-4" />
            新規作成
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {isLoading ? (
            <div className="text-center text-gray-500 py-4 text-sm">読み込み中...</div>
          ) : prompts.length === 0 ? (
            <div className="text-center text-gray-500 py-4 text-sm">プロンプトがありません</div>
          ) : (
            <div className="space-y-1">
              {/* デフォルトプロンプト（固定表示） */}
              {prompts.filter((p) => p.isDefault).map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => startEdit(prompt)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    editingPrompt?.id === prompt.id
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
                </button>
              ))}
              {/* カスタムプロンプト */}
              {prompts.filter((p) => !p.isDefault).map((prompt) => (
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
      </div>

      {/* 編集エリア */}
      <div className="flex-1 flex flex-col">
        {isEditing ? (
          <>
            <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
              <h2 className="text-lg font-medium">
                {isCreating ? '新規プロンプト' : isEditingDefault ? 'デフォルトプロンプト編集' : 'プロンプト編集'}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* 名前（デフォルト以外のみ） */}
              {!isEditingDefault && (
                <div>
                  <label className="block text-sm font-medium mb-1">名前</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {/* 対象アプリ（デフォルト以外・新規作成のみ） */}
              {!isEditingDefault && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    対象アプリ（カンマ区切り、空欄で全アプリ）
                  </label>
                  <input
                    type="text"
                    value={appPatterns}
                    onChange={(e) => setAppPatterns(e.target.value)}
                    placeholder="Slack, Discord"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">プロンプト</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="{{text}} で入力テキスト、{{dictionary}} で単語帳を参照"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-zinc-700 flex justify-between">
              <div>
                {/* 削除ボタン（デフォルト以外のみ） */}
                {editingPrompt && !editingPrompt.isDefault && (
                  <button
                    onClick={() => handleDelete(editingPrompt.id)}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    削除
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600"
                >
                  キャンセル
                </button>
                <button
                  onClick={isCreating ? handleCreate : handleUpdate}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  {isCreating ? '作成' : '保存'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            左のリストからプロンプトを選択するか、新規作成してください
          </div>
        )}
      </div>
    </div>
  )
}

export default Prompts
