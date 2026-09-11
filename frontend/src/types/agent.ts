export type AgentStatus = 'queued' | 'running' | 'waiting_tool' | 'completed' | 'failed' | 'max_turns' | 'cancelled'

export type AgentEvent = {
  id: string
  sequence: number
  type: 'run_started' | 'assistant_update' | 'llm_call' | 'llm_output' | 'tool_call' | 'tool_result' | 'web_search' | 'retry' | 'final' | 'error' | 'run_stopped'
  status: AgentStatus | string
  tool_name: string | null
  display_message: string
  input_summary: Record<string, unknown> | null
  result_summary: Record<string, unknown> | null
  error_code: string | null
  created_at: string
}

export type AgentReference = {
  rank: number
  source_type: 'local' | 'web'
  document_id: string | null
  document_title: string
  chunk_id: string | null
  chunk_ordinal: number | null
  local_start_char: number | null
  local_end_char: number | null
  excerpt: string
  score: number
  local_match_type: string
  url: string | null
  title?: string
  snippet?: string
  provider_source_id?: string | null
}

export type AgentResult = {
  run_id: string
  conversation_id: string | null
  history_id?: string | null
  turn_id?: string | null
  turn_index?: number | null
  question: string
  answer: string | null
  status: AgentStatus
  termination_reason: string | null
  references: AgentReference[]
  web_references: AgentReference[]
  retrieved_count: number
  insufficient_evidence: boolean
  related_concepts: import('./document').Concept[]
  agent_turn_count: number
  tool_call_count: number
  model: string | null
  error: { code?: string; message?: string } | null
  started_at?: string | null
  finished_at?: string | null
  events?: AgentEvent[]
}

export type AgentRunAccepted = {
  run_id: string
  conversation_id: string | null
  status: AgentStatus
  events_url: string
  result_url: string
  cancel_url: string
  created_at: string
}
