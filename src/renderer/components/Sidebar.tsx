import { ClockIcon, Cog6ToothIcon, BookOpenIcon, DocumentTextIcon } from './icons'

type Page = 'history' | 'settings' | 'dictionary' | 'prompts'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const navItems: { page: Page; label: string; icon: React.FC<{ className?: string }> }[] = [
  { page: 'history', label: '履歴', icon: ClockIcon },
  { page: 'dictionary', label: '単語帳', icon: BookOpenIcon },
  { page: 'prompts', label: 'プロンプト', icon: DocumentTextIcon },
  { page: 'settings', label: '設定', icon: Cog6ToothIcon }
]

function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 bg-white/50 dark:bg-transparent flex flex-col border-r border-gray-200/50 dark:border-zinc-700/50">
      {/* タイトルバードラッグ領域 */}
      <div className="h-10 titlebar-drag" />

      {/* ナビゲーション */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className={`
              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
              transition-colors duration-150 titlebar-no-drag
              ${
                currentPage === page
                  ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-200/50 dark:hover:bg-zinc-700/50'
              }
            `}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </nav>

      {/* フッター */}
      <div className="px-4 py-3 text-xs text-gray-400 dark:text-zinc-500">
        Voice Input v0.1.0
      </div>
    </aside>
  )
}

export default Sidebar
