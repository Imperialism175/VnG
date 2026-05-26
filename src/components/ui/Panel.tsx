import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  fillHeight?: boolean
}

export function Panel({ title, icon, action, children, className = '', fillHeight }: PanelProps) {
  return (
    <section
      className={`vng-panel flex flex-col overflow-hidden ${
        fillHeight ? 'h-full min-h-0' : ''
      } ${className}`}
    >
      <header className="vng-panel-header flex items-center justify-between gap-2 px-2 py-1 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 opacity-80">{icon}</span>}
          <h2 className="text-sm font-bold uppercase truncate">── {title.toUpperCase()} ──</h2>
        </div>
        {action}
      </header>
      <div className={`flex-1 min-h-0 ${fillHeight ? 'overflow-hidden flex flex-col' : ''}`}>
        <div className={`p-2 ${fillHeight ? 'flex flex-1 flex-col min-h-0 overflow-hidden' : ''}`}>
          {children}
        </div>
      </div>
    </section>
  )
}
