import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, PencilIcon } from '../components/icons'
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
  const [isDefault, setIsDefault] = useState(false)

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
    setIsDefault(false)
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
        isDefault
      })
      setPrompts([newPrompt, ...prompts.map((p) => (isDefault ? { ...p, isDefault: false } : p))])
      resetForm()
    } catch (error) {
      console.error('Failed to create prompt:', error)
    }
  }

  const handleUpdate = async () => {
    if (!editingPrompt || !name.trim() || !content.trim()) return
    try {
      const patterns = appPatterns.trim()
        ? appPatterns.split(',').map((p) => p.trim()).filter(Boolean)
        : null
      const updated = await window.electron.promptsUpdate(editingPrompt.id, {
        name,
        content,
        appPatterns: patterns,
        isDefault
      })
      setPrompts(
        prompts.map((p) => {
          if (p.id === editingPrompt.id) return updated
          if (isDefault) return { ...p, isDefault: false }
          return p
        })
      )
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
    } catch (error) {
      console.error('Failed to delete prompt:', error)
    }
  }

  const startEdit = (prompt: PromptEntry) => {
    setEditingPrompt(prompt)
    setName(prompt.name)
    setContent(prompt.content)
    setAppPatterns(prompt.appPatterns?.join(', ') || '')
    setIsDefault(prompt.isDefault)
    setIsCreating(false)
  }

  const startCreate = () => {
    resetForm()
    setIsCreating(true)
  }

  const isEditing = editingPrompt !== null || isCreating

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
              {prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => startEdit(prompt)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    editingPrompt?.id === prompt.id
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{prompt.name}</span>
                    {prompt.isDefault && (
                      <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">
                        デフォルト
                      </span>
                    )}
                  </div>
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
                {isCreating ? '新規プロンプト' : 'プロンプト編集'}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">名前</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="isDefault" className="text-sm">
                  デフォルトプロンプトとして使用
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-zinc-700 flex justify-between">
              <div>
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
