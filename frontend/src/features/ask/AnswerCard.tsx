import { Badge, Card } from '../../components/ui'
import type { AskResponse } from '../../types/search'

export default function AnswerCard({ answer }: { answer: AskResponse }) {
  return <Card className="answer-card"><div className="answer-header"><Badge tone="violet">AI SYNTHESIS</Badge><span>{answer.model}</span></div><h2>{answer.question}</h2><p className="answer-body">{answer.answer}</p>{answer.insufficient_evidence && <div className="evidence-warning">저장된 자료에서 충분한 근거를 찾지 못했습니다. 아래 자료를 참고해 추가로 확인하세요.</div>}</Card>
}
