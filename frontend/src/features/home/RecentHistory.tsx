import type { HistorySummary } from '../../types/history'
import type { ConversationSummary } from '../../types/search'
import HistoryList from '../history/HistoryList'

export default function RecentHistory({ items, onOpen }: { items: HistorySummary[]; onOpen: (id: string) => void }) {
  const conversations: ConversationSummary[] = items.slice(0, 2).map((item) => ({ conversation_id: item.conversation_id || item.id, title: item.question_preview, last_question_preview: item.question_preview, last_answer_preview: item.answer_preview, turn_count: 1, last_turn_index: item.turn_index ?? 0, created_at: item.created_at, updated_at: item.created_at }))
  return <div className="home-section"><div className="section-title"><span className="eyebrow">RECENT QUESTIONS</span><span>{items.length} saved</span></div><HistoryList items={conversations} onOpen={onOpen} /></div>
}
