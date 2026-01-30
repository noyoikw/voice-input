import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, PencilIcon } from '../components/icons'
import type { DictionaryEntry } from '../../shared/types'

function Dictionary() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [reading, setReading] = useState('')
  const [display, setDisplay] = useState('')

  useEffect(() => {
    loadDictionary()
  }, [])

  const loadDictionary = async () => {
    setIsLoading(true)
    try {
      const data = await window.electron.dictionaryList()
      setEntries(data)
    } catch (error) {
      console.error('Failed to load dictionary:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!reading.trim() || !display.trim()) return
    try {
      const newEntry = await window.electron.dictionaryCreate({ reading, display })
      setEntries([newEntry, ...entries])
      setReading('')
      setDisplay('')
      setIsAdding(false)
    } catch (error) {
      console.error('Failed to add word:', error)
    }
  }

  const handleUpdate = async (id: number) => {
    if (!reading.trim() || !display.trim()) return
    try {
      const updated = await window.electron.dictionaryUpdate(id, { reading, display })
      setEntries(entries.map((e) => (e.id === id ? updated : e)))
      setReading('')
      setDisplay('')
      setEditingId(null)
    } catch (error) {
      console.error('Failed to update word:', error)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await window.electron.dictionaryDelete(id)
      setEntries(entries.filter((e) => e.id !== id))
    } catch (error) {
      console.error('Failed to delete word:', error)
    }
  }

  const startEdit = (entry: DictionaryEntry) => {
    setEditingId(entry.id)
    setReading(entry.reading)
    setDisplay(entry.display)
    setIsAdding(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setReading('')
    setDisplay('')
    setIsAdding(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">単語帳</h1>
          <button
            onClick={() => {
              setIsAdding(true)
              setEditingId(null)
              setReading('')
              setDisplay('')
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
          >
            <PlusIcon className="w-4 h-4" />
            追加
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          音声認識で誤変換されやすい単語を登録すると、リライト時に正しく変換されます
        </p>
      </div>

      {/* 追加/編集フォーム */}
      {(isAdding || editingId !== null) && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-zinc-700">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">読み（ひらがな）</label>
              <input
                type="text"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                placeholder="くろーど"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">表記</label>
              <input
                type="text"
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                placeholder="Claude"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={editingId !== null ? () => handleUpdate(editingId) : handleAdd}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                {editingId !== null ? '更新' : '保存'}
              </button>
              <button
                onClick={cancelEdit}
                className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 単語リスト */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center text-gray-500 py-8">読み込み中...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            単語が登録されていません
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg group"
              >
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 dark:text-zinc-400 text-sm min-w-[100px]">
                    {entry.reading}
                  </span>
                  <span className="font-medium">→</span>
                  <span>{entry.display}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(entry)}
                    className="p-1.5 text-gray-400 hover:text-blue-500"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dictionary
