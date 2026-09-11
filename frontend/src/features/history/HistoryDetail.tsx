import type { HistorySummary } from '../../types/history'
import { Card } from '../../components/ui'

export default function HistoryDetail({ item }: { item: HistorySummary }) {
  return <Card className="history-detail"><span className="eyebrow">SAVED QUESTION</span><h2>{item.question_preview}</h2><p>{item.answer_preview}</p><div className="detail-meta"><span>{item.reference_count} references</span><span>{new Date(item.created_at).toLocaleString('ko-KR')}</span></div></Card>
}
