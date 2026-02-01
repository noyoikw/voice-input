interface PageHeaderProps {
  title: string
  description?: string
}

function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="px-6 pt-4 pb-4 border-b border-gray-200 dark:border-zinc-700">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description && (
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      )}
    </div>
  )
}

export default PageHeader
