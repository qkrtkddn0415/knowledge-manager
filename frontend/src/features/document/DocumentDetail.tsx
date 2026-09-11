import type { DocumentDetail as DocumentDetailType, Concept } from '../../types/document'
import { Badge, Button, Card } from '../../components/ui'
import ConceptBadge from '../concept/ConceptBadge'
import ChunkList from './ChunkList'
import GraphEdgeBlock, { type EdgeRelation } from '../graph/GraphEdgeBlock'

type Props = {
  document: DocumentDetailType
  highlightedChunkId?: string | null
  highlightedStart?: number | null
  highlightedEnd?: number | null
  onOpenConcept: (concept: Concept) => void
  onOpenRelated: (id: string) => void
  onArrange: () => void
  onDelete?: () => void
  relations?: EdgeRelation[]
  onOpenGraphNode?: (id: string) => void
}

export default function DocumentDetail({ document, highlightedChunkId, highlightedStart, highlightedEnd, onOpenConcept, onOpenRelated, onArrange, onDelete, relations = [], onOpenGraphNode }: Props) {
  const highlightedChunk = document.chunks.find((chunk) => chunk.id === highlightedChunkId)
  const start = Math.max(0, Math.min(document.content.length, highlightedStart ?? highlightedChunk?.start_char ?? 0))
  const end = Math.max(start, Math.min(document.content.length, highlightedEnd ?? highlightedChunk?.end_char ?? start))
  const hasHighlight = Boolean(highlightedChunk && end > start)

  return <div className="document-detail">
    <div className="detail-kicker"><Badge tone="cyan">{document.source_format.toUpperCase()}</Badge><span>{document.source_name}</span></div>
    <h2>{document.title}</h2>
    <p className="detail-summary">{document.summary}</p>
    <div className="detail-meta"><span>추가 {new Date(document.created_at).toLocaleDateString('ko-KR')}</span><span>{document.content_chars.toLocaleString()} chars</span><Badge tone="green">READY</Badge></div>
    <div className="detail-action-row document-actions">
      <Button variant="secondary" onClick={onArrange}>문서 기준으로 정렬</Button>
      {onDelete && <Button variant="danger" onClick={onDelete}>자료 삭제</Button>}
      <span>문서와 연결된 개념을 그래프에서 확인합니다.</span>
    </div>
    <GraphEdgeBlock relations={relations} onOpenNode={onOpenGraphNode} />
    {hasHighlight && <Card className="evidence-match"><div className="card-heading"><span>근거 위치 매칭</span><Badge tone="amber">CHUNK {String((highlightedChunk?.ordinal ?? 0) + 1).padStart(2, '0')}</Badge></div><p>답변 근거가 원문의 {start.toLocaleString()}~{end.toLocaleString()} 구간에서 확인되었습니다.</p><p className="evidence-match-preview">{document.content.slice(start, end)}</p></Card>}
    <Card><div className="card-heading"><span>EXTRACTED CONCEPTS</span><span>{document.concepts.length}</span></div><div className="concept-pills">{document.concepts.map((concept) => <button key={concept.id} onClick={() => onOpenConcept(concept)}><ConceptBadge type={concept.concept_type} /><strong>{concept.canonical_name}</strong></button>)}</div></Card>
    <Card><div className="card-heading"><span>ORIGINAL TEXT</span><span>{document.chunks.length} chunks</span></div><div className="original-text">{hasHighlight ? <>{document.content.slice(0, start)}<mark className="source-highlight">{document.content.slice(start, end)}</mark>{document.content.slice(end)}</> : document.content}</div></Card>
    <Card><div className="card-heading"><span>DOCUMENT CHUNKS</span><span>근거 검색</span></div><ChunkList chunks={document.chunks} activeChunkId={highlightedChunkId} /></Card>
    {document.related_documents.length > 0 && <Card><div className="card-heading"><span>RELATED SOURCES</span></div>{document.related_documents.map((related) => <button className="related-document" key={related.document_id} onClick={() => onOpenRelated(related.document_id)}><span>{related.title}</span><small>{related.reason}</small><b>{Math.round(related.score * 100)}%</b></button>)}</Card>}
  </div>
}
