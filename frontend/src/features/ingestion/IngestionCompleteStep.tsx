import { Button } from '../../components/ui'

export default function IngestionCompleteStep({ title, count, onClose, onExplore, onAddNext }: { title: string; count: number; onClose: () => void; onExplore: () => void; onAddNext: () => void }) {
  return <div className="ingestion-complete"><span className="complete-mark">✦</span><span className="eyebrow">KNOWLEDGE ADDED</span><h3>{title}</h3><p>{count}개의 개념과 연결을 지식 그래프에 반영했습니다.</p><div className="step-actions"><Button variant="ghost" onClick={onClose}>닫기</Button><Button variant="secondary" onClick={onAddNext}>다음 자료 추가</Button><Button variant="primary" onClick={onExplore}>그래프 탐색 →</Button></div></div>
}
