import { useState, useRef, useEffect, useCallback } from 'react'
import type { AppPatternInfo } from '../../shared/types'

interface AppPatternTagInputProps {
  value: string[]
  onChange: (patterns: string[]) => void
  allPatterns: AppPatternInfo[]
  currentPromptId: number | null
  disabled?: boolean
}

export function AppPatternTagInput({
  value,
  onChange,
  allPatterns,
  currentPromptId,
  disabled = false
}: AppPatternTagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // フィルタされた候補リスト (case-sensitive)
  const filteredOptions = allPatterns.filter((p) => {
    // 既に選択済みのパターンは除外
    if (value.includes(p.pattern)) return false
    // 入力値でフィルタ (case-sensitive)
    if (inputValue && !p.pattern.includes(inputValue)) return false
    return true
  })

  // 新規追加オプションを表示するか (case-sensitive)
  const showCreateOption =
    inputValue.trim() &&
    !allPatterns.some((p) => p.pattern === inputValue) &&
    !value.some((v) => v === inputValue)

  // ハイライト位置の調整
  const totalOptions = filteredOptions.length + (showCreateOption ? 1 : 0)

  useEffect(() => {
    if (highlightedIndex >= totalOptions) {
      setHighlightedIndex(Math.max(0, totalOptions - 1))
    }
  }, [totalOptions, highlightedIndex])

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ハイライトされた項目をスクロール
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li')
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  const addPattern = useCallback(
    (pattern: string) => {
      const trimmed = pattern.trim()
      if (!trimmed) return
      if (value.includes(trimmed)) return
      onChange([...value, trimmed])
      setInputValue('')
      setHighlightedIndex(-1)
      inputRef.current?.focus()
    },
    [value, onChange]
  )

  const removePattern = useCallback(
    (pattern: string) => {
      onChange(value.filter((v) => v !== pattern))
    },
    [value, onChange]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setHighlightedIndex((prev) => (prev + 1) % totalOptions)
        }
        break

      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) {
          setHighlightedIndex((prev) => (prev <= 0 ? totalOptions - 1 : prev - 1))
        }
        break

      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0) {
          // 候補から選択
          if (highlightedIndex < filteredOptions.length) {
            const option = filteredOptions[highlightedIndex]
            // 他のプロンプトで使用中でなければ追加
            if (option.promptId === null || option.promptId === currentPromptId) {
              addPattern(option.pattern)
            }
          } else if (showCreateOption) {
            // 新規追加
            addPattern(inputValue)
          }
        } else if (inputValue.trim()) {
          // 入力値をそのまま追加
          addPattern(inputValue)
        }
        break

      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break

      case 'Backspace':
        if (!inputValue && value.length > 0) {
          // 入力が空のときは最後のタグを削除
          removePattern(value[value.length - 1])
        }
        break
    }
  }

  const handleOptionClick = (pattern: string, isDisabled: boolean) => {
    if (isDisabled) return
    addPattern(pattern)
  }

  // 他のプロンプトで使用中かどうか
  const isPatternDisabled = (p: AppPatternInfo) => {
    return p.promptId !== null && p.promptId !== currentPromptId
  }

  // ラベルを取得
  const getOptionLabel = (p: AppPatternInfo) => {
    if (p.source === 'history') {
      return '最近音声入力したアプリ'
    }
    if (p.promptId !== null && p.promptId !== currentPromptId && p.promptName) {
      return `「${p.promptName}」で使用中`
    }
    return null
  }

  return (
    <div ref={containerRef} className="relative">
      {/* タグ表示 + 入力フィールド */}
      <div
        className={`
          flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5
          bg-gray-100 dark:bg-zinc-800 rounded-lg
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isOpen ? 'ring-2 ring-blue-500' : ''}
        `}
        onClick={() => inputRef.current?.focus()}
      >
        {/* 選択済みタグ */}
        {value.map((pattern) => (
          <span
            key={pattern}
            className="
              inline-flex items-center gap-1 px-2 py-0.5
              bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300
              text-sm rounded
            "
          >
            <span className="truncate max-w-[200px]">{pattern}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removePattern(pattern)
                }}
                className="
                  ml-0.5 p-0.5 rounded-sm
                  hover:bg-blue-200 dark:hover:bg-blue-800
                  transition-colors
                "
                aria-label={`${pattern}を削除`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        ))}

        {/* 入力フィールド */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={value.length === 0 ? 'アプリ名を入力...' : ''}
          className="
            flex-1 min-w-[120px] px-1 py-0.5
            bg-transparent border-none outline-none
            text-sm placeholder:text-gray-400 dark:placeholder:text-zinc-500
          "
        />
      </div>

      {/* ドロップダウン候補 */}
      {isOpen && (filteredOptions.length > 0 || showCreateOption) && (
        <ul
          ref={listRef}
          className="
            absolute z-50 mt-1 w-full max-h-60 overflow-auto
            bg-white dark:bg-zinc-900
            border border-gray-200 dark:border-zinc-700
            rounded-lg shadow-lg
            py-1
          "
        >
          {filteredOptions.map((option, index) => {
            const isDisabled = isPatternDisabled(option)
            const isHighlighted = index === highlightedIndex
            const label = getOptionLabel(option)

            return (
              <li
                key={option.pattern}
                onClick={() => handleOptionClick(option.pattern, isDisabled)}
                className={`
                  px-3 py-2 text-sm cursor-pointer
                  flex items-center justify-between gap-2
                  ${isHighlighted && !isDisabled ? 'bg-blue-50 dark:bg-blue-900/30' : ''}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'}
                `}
              >
                <span className="truncate flex-1">{option.pattern}</span>
                {label && (
                  <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">
                    {label}
                  </span>
                )}
              </li>
            )
          })}

          {/* 新規追加オプション */}
          {showCreateOption && (
            <li
              onClick={() => addPattern(inputValue)}
              className={`
                px-3 py-2 text-sm cursor-pointer
                flex items-center gap-2
                text-blue-600 dark:text-blue-400
                ${highlightedIndex === filteredOptions.length ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'}
              `}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>「{inputValue}」を追加</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
