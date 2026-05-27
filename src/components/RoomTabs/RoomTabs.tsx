import type { ReactNode } from 'react'
import { BarChart3, Crown, Dices, Scroll, Trophy, Users } from 'lucide-react'

export type PlayerTabId = 'sheet' | 'dice' | 'tops' | 'vote'
export type GmTabId = 'players' | 'dice' | 'tops' | 'vote' | 'gm'

interface TabDef<T extends string> {
  id: T
  label: string
  hint: string
  icon: ReactNode
  highlight?: boolean
}

interface RoomTabBarProps<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
}

function RoomTabBar<T extends string>({ tabs, active, onChange }: RoomTabBarProps<T>) {
  return (
    <nav className="vng-retro-tabbar shrink-0 z-30 safe-area-pb">
      <div className="max-w-7xl mx-auto flex">
        {tabs.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.hint}
              onClick={() => onChange(tab.id)}
              className={`vng-retro-tab flex-1 flex flex-col items-center gap-1 py-3 px-0.5 min-w-0 ${
                isActive ? 'vng-retro-tab--active' : tab.highlight ? 'vng-retro-tab--pulse' : ''
              } ${isActive && tab.id === 'tops' ? 'vng-retro-tab--tops' : ''}`}
            >
              {tab.icon}
              <span className="vng-retro-tab__label uppercase truncate max-w-full px-0.5">
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function PlayerTabBar({
  active,
  onChange,
  showEncounter: _showEncounter,
  showVote,
}: {
  active: PlayerTabId
  onChange: (id: PlayerTabId) => void
  showEncounter?: boolean
  showVote?: boolean
}) {
  const tabs: TabDef<PlayerTabId>[] = [
    { id: 'sheet', label: 'Лист', hint: 'Свой и чужие листы', icon: <Scroll size={18} /> },
    { id: 'dice', label: 'Кубы', hint: 'Бросок кубов', icon: <Dices size={18} /> },
    { id: 'tops', label: 'Топ', hint: 'Рейтинг от мастера', icon: <Trophy size={18} /> },
  ]
  if (showVote) {
    tabs.push({
      id: 'vote',
      label: 'Голос',
      hint: 'Голосование в комнате',
      icon: <BarChart3 size={18} />,
      highlight: active !== 'vote',
    })
  }
  return <RoomTabBar tabs={tabs} active={active} onChange={onChange} />
}

export function GmTabBar({
  active,
  onChange,
  showEncounter: _showEncounter,
  showVote,
}: {
  active: GmTabId
  onChange: (id: GmTabId) => void
  showEncounter?: boolean
  showVote?: boolean
}) {
  const tabs: TabDef<GmTabId>[] = [
    { id: 'players', label: 'Игроки', hint: 'Листы и HP игроков', icon: <Users size={18} /> },
    { id: 'dice', label: 'Кубы', hint: 'Бросок кубов', icon: <Dices size={18} /> },
    { id: 'tops', label: 'Топ', hint: 'Ручной рейтинг', icon: <Trophy size={18} /> },
  ]
  if (showVote) {
    tabs.push({
      id: 'vote',
      label: 'Голос',
      hint: 'Голосование',
      icon: <BarChart3 size={18} />,
      highlight: active !== 'vote',
    })
  }
  tabs.push({ id: 'gm', label: 'ГМ', hint: 'Инструменты мастера', icon: <Crown size={18} /> })
  return <RoomTabBar tabs={tabs} active={active} onChange={onChange} />
}
