import type { Concept } from './document'

export type SearchResult = {
  rank: number
  result_type: 'document' | 'chunk' | 'concept'
  document_id: string
  chunk_id: string | null
  concept_id: string | null
  title: string
  excerpt: string
  score: number
  match_type: 'lexical' | 'semantic' | 'hybrid'
  matched_terms: string[]
}

export type Reference = {
  rank: number
  document_id: string
  document_title: string
  chunk_id: string | null
  chunk_ordinal: number | null
  local_start_char: number | null
  local_end_char: number | null
  excerpt: string
  score: number
  local_match_type: 'exact' | 'overlap' | 'unresolved'
  url: string | null
  source_type?: 'local' | 'web'
  title?: string
  snippet?: string
}

export type AskResponse = {
  conversation_id: string | null
  turn_id: string | null
  turn_index: number | null
  history_id: string | null
  question: string
  answer: string
  references: Reference[]
  web_references?: Reference[]
  retrieved_count: number
  insufficient_evidence: boolean
  related_concepts: Concept[]
  model: string | null
}

export type AskRequest = {
  question: string
  conversation_id?: string | null
  save_history?: boolean
  document_ids?: string[]
}

export type ChatTurn = {
  turn_id: string
  turn_index: number
  question: string
  answer: string
  answer_status: 'answered' | 'insufficient_evidence' | 'failed'
  references: Reference[]
  retrieved_count: number
  insufficient_evidence: boolean
  related_concepts: Concept[]
  web_references?: Reference[]
  model: string | null
  created_at: string
}

export type ConversationSummary = {
  conversation_id: string
  title: string
  last_question_preview: string
  last_answer_preview: string
  turn_count: number
  last_turn_index: number
  created_at: string
  updated_at: string
}

export type ConversationDetail = ConversationSummary & {
  turns: ChatTurn[]
}
