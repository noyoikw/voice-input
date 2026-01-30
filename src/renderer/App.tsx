import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import History from './pages/History'
import Settings from './pages/Settings'
import Dictionary from './pages/Dictionary'
import Prompts from './pages/Prompts'

type Page = 'history' | 'settings' | 'dictionary' | 'prompts'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('history')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // 初期テーマ取得
    window.electron.themeGet().then(setTheme)

    // テーマ変更リスナー
    const unsubscribe = window.electron.onThemeChanged(setTheme)
    return unsubscribe
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'history':
        return <History />
      case 'settings':
        return <Settings />
      case 'dictionary':
        return <Dictionary />
      case 'prompts':
        return <Prompts />
      default:
        return <History />
    }
  }

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-auto bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100">
        {renderPage()}
      </main>
    </div>
  )
}

export default App
