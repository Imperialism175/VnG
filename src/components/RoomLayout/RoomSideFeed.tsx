import type { ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import { RoomFeed } from '@/components/RoomFeed/RoomFeed'
import type { ChatMessage, RollEvent } from '@/types'

interface RoomSideFeedProps {
  rollEvents: RollEvent[]
  chatMessages: ChatMessage[]
  onSendChat: (text: string) => void
  gmPlayerId?: string
  disabled?: boolean
}

export function RoomSideFeed({ rollEvents, chatMessages, onSendChat, gmPlayerId, disabled }: RoomSideFeedProps) {
  return (
    <aside className="vng-room-sidefeed">
      <header className="vng-room-sidefeed__head shrink-0 flex items-center gap-2 px-3 py-2">
        <MessageSquare size={16} className="shrink-0 opacity-90" />
        <span className="text-xs font-bold uppercase tracking-wider">Чат и броски</span>
      </header>
      <div className="vng-room-sidefeed__body">
        <RoomFeed
          rollEvents={rollEvents}
          chatMessages={chatMessages}
          onSendChat={onSendChat}
          gmPlayerId={gmPlayerId}
          disabled={disabled}
          fillHeight
        />
      </div>
    </aside>
  )
}

interface RoomMainLayoutProps {
  encounterBanner?: ReactNode
  children: ReactNode
  roster: ReactNode
  sideFeed: ReactNode
}

export function RoomMainLayout({ encounterBanner, children, roster, sideFeed }: RoomMainLayoutProps) {
  return (
    <div className="vng-room-layout flex flex-1 flex-col min-h-0">
      {encounterBanner}
      <div className="vng-room-layout__body flex flex-1 min-h-0 flex-col lg:flex-row">
        {roster ? <div className="vng-room-layout__roster order-1 lg:order-1">{roster}</div> : null}
        <div className="vng-room-layout__main flex-1 min-h-0 flex flex-col min-w-0 order-2 lg:order-2">
          {children}
        </div>
        {sideFeed ? <div className="vng-room-layout__side order-3 lg:order-3">{sideFeed}</div> : null}
      </div>
    </div>
  )
}
