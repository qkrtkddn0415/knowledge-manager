import { useState } from 'react'
import type { Concept } from '../../types/document'
import type { AskResponse, ChatTurn, Reference } from '../../types/search'
import type { AgentEvent, AgentStatus } from '../../types/agent'
import { Button, EmptyState, ErrorState, Input, LoadingState } from '../../components/ui'
import AnswerCard from './AnswerCard'
import EvidenceList from './EvidenceList'
import RelatedConceptStrip from './RelatedConceptStrip'
import AgentActivity from '../agent/AgentActivity'

function responseFromTurn(turn: ChatTurn): AskResponse {
  return { conversation_id: null, turn_id: turn.turn_id, turn_index: turn.turn_index, history_id: turn.turn_id, question: turn.question, answer: turn.answer, references: turn.references, web_references: turn.web_references, retrieved_count: turn.retrieved_count, insufficient_evidence: turn.insufficient_evidence, related_concepts: turn.related_concepts, model: turn.model || '' }
}

type Props = {
  turns: ChatTurn[]
  question: string
  loading: boolean
  error: Error | null
  conversationId: string | null
  onQuestionChange: (value: string) => void
  onAsk: () => void
  onNewConversation: () => void
  onOpenReference: (reference: Reference) => void
  onSelectConcept: (concept: Concept) => void
  agentEvents?: AgentEvent[]
  agentStatus?: AgentStatus
  onCancelAgent?: () => void
  onImportWebSource?: (reference: Reference) => Promise<void>
}

export default function AskPage({ turns, question, loading, error, conversationId, onQuestionChange, onAsk, onNewConversation, onOpenReference, onSelectConcept, agentEvents = [], agentStatus = 'queued', onCancelAgent, onImportWebSource }: Props) {
  const [savingUrl, setSavingUrl] = useState<string | null>(null)
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set())
  const saveWebSource = async (reference: Reference) => {
    if (!reference.url || !onImportWebSource || savingUrl) return
    setSavingUrl(reference.url)
    try { await onImportWebSource(reference); setSavedUrls((current) => new Set(current).add(reference.url || '')) } finally { setSavingUrl(null) }
  }
  return <section className="content-view ask-page">
    <div className="page-heading"><span className="eyebrow">ASK YOUR KNOWLEDGE</span><h1>Make a connection.</h1><p>저장된 자료에서 최대 3개의 근거를 찾아 AI가 답변하고, 참고 문서 위치를 함께 표시합니다.</p></div>
    <div className="chat-toolbar"><span className="conversation-state">{conversationId ? `대화 · ${turns.length}턴` : '새 대화'}</span><Button variant="secondary" onClick={onNewConversation} disabled={loading && turns.length === 0}>새 대화</Button></div>
    <div className="chat-transcript">
      {!turns.length && !loading && !error && <EmptyState eyebrow="GROUNDED ANSWERS" title="자료에게 질문해보세요" description="후속 질문은 현재 대화의 맥락을 이어가며, 답변과 함께 실제 참고 문서를 표시합니다." />}
      <AgentActivity events={agentEvents} status={agentStatus} loading={loading} onCancel={onCancelAgent} />
      {turns.map((turn) => { const answer = responseFromTurn(turn); return <article className="chat-turn" key={turn.turn_id}>
        <div className="user-question"><span className="eyebrow">YOU · {turn.turn_index + 1}</span><p>{turn.question}</p></div>
        <AnswerCard answer={answer} />
        <div className="evidence-section"><div className="section-title"><span className="eyebrow">SOURCES · {answer.references.length}</span><h2>이 답변의 근거</h2></div>{answer.references.length ? <EvidenceList references={answer.references} onOpen={onOpenReference} /> : <p className="chat-no-evidence">이 답변에서 확인할 참고 문서가 없습니다.</p>}</div>
        {!!answer.web_references?.length && <div className="web-reference-list"><div className="section-title"><span className="eyebrow">WEB SOURCES · {answer.web_references.length}</span><h2>웹 참고 자료</h2></div>{answer.web_references.map((reference) => { const saved = Boolean(reference.url && savedUrls.has(reference.url)); return <article className="web-reference-card" key={reference.rank + '-' + reference.url}><div><a className="web-reference-title" href={reference.url || '#'} target="_blank" rel="noreferrer">{reference.title || reference.url}</a><small>{reference.url}</small>{reference.snippet && <p>{reference.snippet}</p>}</div><div className="web-reference-actions"><a href={reference.url || '#'} target="_blank" rel="noreferrer">원문 열기 ↗</a>{onImportWebSource && <Button variant="secondary" onClick={() => void saveWebSource(reference)} disabled={saved || savingUrl === reference.url}>{saved ? '저장 요청됨' : savingUrl === reference.url ? '저장 중…' : '자료로 저장'}</Button>}</div></article> })}</div>}
        <RelatedConceptStrip concepts={answer.related_concepts} onSelect={onSelectConcept} />
      </article> })}
      {loading && <LoadingState label="관련 청크를 찾고 답변을 정리하는 중…" />}
      {error && <ErrorState error={error} onRetry={onAsk} />}
    </div>
    <div className="ask-input chat-input"><Input value={question} onChange={(event) => onQuestionChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onAsk()} placeholder="후속 질문을 입력하세요…" aria-label="질문 입력" /><Button variant="primary" onClick={onAsk} disabled={loading || !question.trim()}>{loading ? '답변 중…' : '질문하기'}</Button></div>
  </section>
}
