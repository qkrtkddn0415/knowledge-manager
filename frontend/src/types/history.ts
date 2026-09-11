import type { Reference } from './search'

export type HistorySummary = {
  id: string
  question_preview: string
  answer_preview: string
  answer_status: 'answered' | 'insufficient_evidence' | 'failed'
  reference_count: number
  conversation_id?: string | null
  turn_index?: number | null
  created_at: string
}

export type HistoryDetail = HistorySummary & {
  question: string
  answer: string
  references: Reference[]
  related_concepts: string[]
}
