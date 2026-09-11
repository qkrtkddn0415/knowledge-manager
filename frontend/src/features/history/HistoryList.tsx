import type { ConversationSummary } from '../../types/search'
import { Badge } from '../../components/ui'

export default function HistoryList({ items, onOpen }: { items: ConversationSummary[]; onOpen: (id: string) => void }) {
  return <div className="history-list">{items.map((item) => <button className="history-row" key={item.conversation_id} onClick={() => onOpen(item.conversation_id)}><span className="history-icon">◷</span><span><strong>{item.title}</strong><small>{item.last_answer_preview}</small></span><span className="history-side"><Badge tone="violet">{item.turn_count} turns</Badge><small>{new Date(item.updated_at).toLocaleDateString('ko-KR')}</small></span></button>)}</div>
}
