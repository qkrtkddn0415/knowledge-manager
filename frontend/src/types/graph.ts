import type { ConceptType } from './document'

export type GraphNode = {
  id: string
  node_type: 'document' | 'chunk' | 'concept'
  label: string
  subtitle: string | null
  concept_type: ConceptType | null
  document_id: string | null
  entity_id: string
  is_visible_default: boolean
  size: number
  color_token: string
  canonical_id?: string
  satellite_source_id?: string
  show_label?: boolean
  x?: number
  y?: number
  z?: number
  fx?: number
  fy?: number
  fz?: number
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  relation_type: string
  label: string
  evidence_chunk_id: string
  evidence_text: string
  confidence: number
  show_label?: boolean
  /** UI-only bridge derived from shared concepts; not persisted as a factual edge. */
  is_derived?: boolean
}

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  counts: { document: number; chunk: number; concept: number }
  truncated: boolean
  focus_node_id: string | null
}
