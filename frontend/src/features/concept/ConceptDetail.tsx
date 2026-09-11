import type { Concept } from '../../types/document'
import { Badge, Button, Card } from '../../components/ui'
import ConceptBadge from './ConceptBadge'
import RelatedConcepts from './RelatedConcepts'
import GraphEdgeBlock, { type EdgeRelation } from '../graph/GraphEdgeBlock'

export default function ConceptDetail({ concept, related, onOpenDocument, onSelectConcept, onArrange, relations = [], onOpenGraphNode }: { concept: Concept; related: Concept[]; onOpenDocument?: () => void; onSelectConcept?: (concept: Concept) => void; onArrange?: () => void; relations?: EdgeRelation[]; onOpenGraphNode?: (id: string) => void }) {
  return <div className="concept-detail"><div className="detail-kicker"><ConceptBadge type={concept.concept_type} /><Badge tone="green">확정 개념</Badge></div><h2>{concept.canonical_name}</h2><p className="detail-subtitle">{[concept.korean_name, concept.english_name, concept.acronym].filter(Boolean).join(' · ')}</p><p className="detail-description">{concept.description}</p><div className="detail-action-row"><Button variant="secondary" onClick={onArrange}>이 개념 기준으로 정렬</Button><span>연결된 문서와 개념을 주변에 배치합니다.</span></div><GraphEdgeBlock relations={relations} onOpenNode={onOpenGraphNode} /><div className="metric-strip"><span><strong>{concept.document_count}</strong> documents</span><span><strong>{concept.chunk_count}</strong> chunks</span><span><strong>{concept.related_concept_count}</strong> links</span></div><Card><div className="card-heading"><span>CONNECTED IDEAS</span><span className="eyebrow">EXPLORE</span></div><RelatedConcepts concepts={related} onSelect={onSelectConcept} /></Card><button className="text-link" onClick={onOpenDocument}>이 개념이 등장한 자료 보기 →</button></div>
}
