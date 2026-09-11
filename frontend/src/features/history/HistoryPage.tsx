import type { HistorySummary } from '../../types/history'
import type { ConversationSummary } from '../../types/search'
import { EmptyState } from '../../components/ui'
import HistoryList from './HistoryList'

function legacyConversations(items: HistorySummary[]): ConversationSummary[] {
  return items.map((item) => ({ conversation_id: item.conversation_id || item.id, title: item.question_preview, last_question_preview: item.question_preview, last_answer_preview: item.answer_preview, turn_count: 1, last_turn_index: item.turn_index ?? 0, created_at: item.created_at, updated_at: item.created_at }))
}

export default function HistoryPage({ items, conversations, onOpen }: { items: HistorySummary[]; conversations: ConversationSummary[]; onOpen: (id: string) => void }) {
  const visible = conversations.length ? conversations : legacyConversations(items)
  return <section className="content-view"><div className="page-heading"><span className="eyebrow">YOUR TRAIL</span><h1>Question history.</h1><p>저장된 대화를 다시 열어 질문과 근거를 확인합니다.</p></div>{visible.length ? <HistoryList items={visible} onOpen={onOpen} /> : <EmptyState title="아직 질문 대화가 없습니다." description="지식 홈에서 자료를 바탕으로 첫 질문을 시작해 보세요." />}</section>
}
