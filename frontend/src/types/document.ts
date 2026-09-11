export type ConceptType =
  | 'organization'
  | 'organization_unit'
  | 'person'
  | 'country'
  | 'region'
  | 'place'
  | 'technology'
  | 'equipment'
  | 'system'
  | 'project_program'
  | 'policy_law'
  | 'event'
  | 'document'

export type IngestStatus =
  | 'draft'
  | 'analyzing'
  | 'review_ready'
  | 'storing'
  | 'ready'
  | 'failed'
  | 'deleted'

export type DocumentSummary = {
  id: string
  title: string
  source_name: string
  source_format: 'txt' | 'md' | 'pdf'
  summary: string | null
  content_chars: number
  chunk_count: number
  concept_count: number
  ingest_status: IngestStatus
  created_at: string
  updated_at: string
}

export type Chunk = {
  id: string
  document_id: string
  ordinal: number
  start_char: number
  end_char: number
  text: string
  concept_ids: string[]
}

export type Concept = {
  id: string
  concept_type: ConceptType
  canonical_name: string
  korean_name: string | null
  english_name: string | null
  acronym: string | null
  description: string
  merge_status: 'confirmed' | 'candidate'
  document_count: number
  chunk_count: number
  related_concept_count: number
}

export type DocumentDetail = DocumentSummary & {
  content: string
  chunks: Chunk[]
  concepts: Concept[]
  related_documents: Array<{ document_id: string; title: string; reason: string; score: number }>
  analysis?: { concepts?: Array<{ key?: string; canonical_name?: string; source_ordinal?: number }>; relations?: Array<{ source_key: string; target_key: string; relation_type: string; label: string; evidence?: string; source_ordinal?: number; confidence: number }> }
}

export type AnalysisConcept = Concept & {
  temp_key: string
  match_status: 'new' | 'existing' | 'candidate'
  source_chunk_ids: string[]
}

export type AnalysisRelation = {
  temp_key: string
  source_key: string
  target_key: string
  relation_type: string
  label: string
  evidence_chunk_id: string
  evidence_text: string
  confidence: number
}

export type AnalysisPreview = {
  document_id: string
  chunk_count: number
  title: string
  summary: string
  concepts: AnalysisConcept[]
  relations: AnalysisRelation[]
}
