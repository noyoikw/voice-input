import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon, TrashIcon } from '../components/icons'
import type { HistoryEntry } from '../../shared/types'

function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadHistory()

    // リアルタイム更新をリッスン
    const unsubscribe = window.electron.onHistoryCreated((entry) => {
      setEntries((prev) => [entry, ...prev])
    })

    return unsubscribe
  }, [])

  const loadHistory = async () => {
    setIsLoading(true)
    try {
      const data = await window.electron.historyList()
      setEntries(data)
    } catch (error) {
      console.error('Failed to load history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadHistory()
      return
    }
    try {
      const data = await window.electron.historySearch(searchQuery)
      setEntries(data)
    } catch (error) {
      console.error('Failed to search history:', error)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await window.electron.historyDelete(id)
      setEntries(entries.filter((e) => e.id !== id))
    } catch (error) {
      console.error('Failed to delete history:', error)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('すべての履歴を削除しますか？')) return
    try {
      await window.electron.historyClear()
      setEntries([])
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  }

  const handleExport = async () => {
    try {
      const csv = await window.electron.historyExportCsv()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `voice-input-history-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export history:', error)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">履歴</h1>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700"
            >
              エクスポート
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
            >
              すべて削除
            </button>
          </div>
        </div>

        {/* 検索 */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="履歴を検索..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 履歴リスト */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center text-gray-500 py-8">読み込み中...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {searchQuery ? '検索結果がありません' : '履歴がありません'}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {entry.rewrittenText && (
                      <p className="text-sm mb-2">{entry.rewrittenText}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      元: {entry.rawText}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <span>{new Date(entry.createdAt).toLocaleString('ja-JP')}</span>
                      {entry.appName && <span>• {entry.appName}</span>}
                      {entry.processingTimeMs && <span>• {entry.processingTimeMs}ms</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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

export default History
