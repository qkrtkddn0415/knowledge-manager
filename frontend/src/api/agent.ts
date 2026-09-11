import { apiBaseUrl, request } from './client'
import type { AgentEvent, AgentResult, AgentRunAccepted } from '../types/agent'
import type { AskRequest } from '../types/search'

export async function createAgentRun(input: AskRequest & { allow_web_search?: boolean }): Promise<AgentRunAccepted> {
  return request<AgentRunAccepted>('/api/knowledge/agent/runs', { method: 'POST', body: JSON.stringify({ save_history: true, ...input }) })
}

export async function getAgentRun(runId: string): Promise<AgentResult> {
  return request<AgentResult>('/api/knowledge/agent/runs/' + encodeURIComponent(runId))
}

export async function cancelAgentRun(runId: string): Promise<{ run_id: string; status: string; cancelled: boolean }> {
  return request('/api/knowledge/agent/runs/' + encodeURIComponent(runId) + '/cancel', { method: 'POST' })
}

export function subscribeAgentEvents(url: string, onEvent: (event: AgentEvent) => void, onError: () => void): EventSource {
  const source = new EventSource(apiBaseUrl + url)
  source.addEventListener('agent', (message) => {
    try { onEvent(JSON.parse((message as MessageEvent).data) as AgentEvent) } catch { onError() }
  })
  source.onerror = onError
  return source
}
