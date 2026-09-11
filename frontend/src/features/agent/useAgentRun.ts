import { useCallback, useRef, useState } from 'react'
import { cancelAgentRun, createAgentRun, getAgentRun, subscribeAgentEvents } from '../../api/agent'
import type { AgentEvent, AgentResult, AgentRunAccepted, AgentStatus } from '../../types/agent'

type Props = { onComplete: (result: AgentResult) => void }

const terminal = new Set<AgentStatus>(['completed', 'failed', 'max_turns', 'cancelled'])

export default function useAgentRun({ onComplete }: Props) {
  const [activeRun, setActiveRun] = useState<AgentRunAccepted | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<AgentStatus>('queued')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const sourceRef = useRef<EventSource | null>(null)
  const seenRef = useRef(new Set<number>())
  const completedRef = useRef(false)

  const hydrate = useCallback(async (runId: string) => {
    const result = await getAgentRun(runId)
    setStatus(result.status)
    if (result.events) {
      const newEvents = result.events.filter((event) => !seenRef.current.has(event.sequence)).reduce<AgentEvent[]>((all, event) => { seenRef.current.add(event.sequence); all.push(event); return all }, [])
      if (newEvents.length) setEvents((current) => [...current, ...newEvents].sort((left, right) => left.sequence - right.sequence))
    }
    if (terminal.has(result.status)) {
      sourceRef.current?.close()
      setLoading(false)
      if (!completedRef.current) { completedRef.current = true; void Promise.resolve(onComplete(result)).catch((reason) => setError(reason instanceof Error ? reason : new Error('Agent 결과 후속 처리를 완료하지 못했습니다.'))) }
    }
    return result
  }, [onComplete])

  const pollUntilFinished = useCallback(async (runId: string) => {
    for (let attempt = 0; attempt < 7200; attempt += 1) {
      const result = await hydrate(runId)
      if (terminal.has(result.status)) return
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    }
    setError(new Error('Agent 실행 상태 확인 시간이 초과되었습니다.'))
    setLoading(false)
  }, [hydrate])

  const start = useCallback(async (question: string, conversationId: string | null, documentIds: string[] = []) => {
    if (loading) return
    setLoading(true); setError(null); setEvents([]); seenRef.current = new Set(); completedRef.current = false
    try {
      const accepted = await createAgentRun({ question, conversation_id: conversationId, document_ids: documentIds })
      setActiveRun(accepted); setStatus(accepted.status)
      const source = subscribeAgentEvents(accepted.events_url, (event) => {
        if (seenRef.current.has(event.sequence)) return
        seenRef.current.add(event.sequence)
        setEvents((current) => [...current, event].sort((left, right) => left.sequence - right.sequence))
        setStatus((event.status as AgentStatus) || 'running')
        if (event.type === 'final' || event.type === 'run_stopped') void hydrate(accepted.run_id).catch((reason) => setError(reason instanceof Error ? reason : new Error('Agent 결과를 불러오지 못했습니다.')))
      }, () => {
        sourceRef.current?.close()
        void pollUntilFinished(accepted.run_id).catch(() => {
          setError(new Error('Agent 진행 상태를 확인하지 못했습니다.'))
          setLoading(false)
        })
      })
      sourceRef.current = source
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Agent 실행을 시작하지 못했습니다.'))
      setLoading(false)
    }
  }, [hydrate, loading, pollUntilFinished])

  const cancel = useCallback(async () => {
    if (!activeRun) return
    await cancelAgentRun(activeRun.run_id)
    setStatus('cancelled')
  }, [activeRun])

  const reset = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
    setActiveRun(null); setEvents([]); setStatus('queued'); setError(null); setLoading(false)
    seenRef.current = new Set(); completedRef.current = false
  }, [])

  return { activeRun, events, status, loading, error, start, cancel, reset }
}
