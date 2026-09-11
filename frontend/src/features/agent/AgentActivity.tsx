import type { AgentEvent, AgentStatus } from '../../types/agent'

type Props = { events: AgentEvent[]; status: AgentStatus; loading: boolean; onCancel?: () => void }

export default function AgentActivity({ events, status, loading, onCancel }: Props) {
  if (!loading && !events.length) return null
  return <section className="agent-activity" aria-live="polite" aria-label="Agent 실행 활동">
    <div className="agent-activity-header">
      <div><span className="eyebrow">AGENT ACTIVITY</span><strong>{statusLabel(status)}</strong><small className="agent-privacy-note">내부추론은 안전한 단계 요약만 표시됩니다.</small></div>
      {loading && onCancel && <button className="agent-cancel" onClick={onCancel}>중단</button>}
    </div>
    <div className="agent-event-list">{events.map((event) => <div className={'agent-event agent-event-' + event.type} key={event.sequence}>
      <span className={'agent-event-kind agent-event-kind-' + eventKindClass(event)}>{eventKind(event)}</span>
      <span className="agent-event-dot" />
      <span>{event.display_message}</span>
      {event.result_summary?.count !== undefined && <small>{String(event.result_summary.count)}건</small>}
    </div>)}</div>
  </section>
}

function eventKind(event: AgentEvent) {
  if (event.type === 'web_search') return '[웹검색]'
  if (event.type === 'tool_call' || event.type === 'tool_result') return '[Tool]'
  if (event.type === 'llm_call' || event.type === 'llm_output') return '[LLM]'
  if (event.type === 'assistant_update') return '[내부추론]'
  return '[Agent]'
}

function eventKindClass(event: AgentEvent) {
  if (event.type === 'web_search') return 'web'
  if (event.type === 'tool_call' || event.type === 'tool_result') return 'tool'
  if (event.type === 'llm_call' || event.type === 'llm_output') return 'llm'
  if (event.type === 'assistant_update') return 'internal'
  return 'agent'
}

function statusLabel(status: AgentStatus) {
  if (status === 'queued') return '실행을 준비하는 중'
  if (status === 'completed') return '탐색 완료'
  if (status === 'max_turns') return '최대 탐색 횟수에 도달'
  if (status === 'failed') return '탐색 실패'
  if (status === 'cancelled') return '탐색 중단'
  return '질문에 맞는 경로를 탐색하는 중'
}
