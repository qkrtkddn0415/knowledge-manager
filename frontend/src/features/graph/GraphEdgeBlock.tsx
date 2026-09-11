import type { GraphNode } from '../../types/graph'
import { Card } from '../../components/ui'

export type EdgeRelation = {
  id: string
  targetId: string
  targetLabel: string
  targetType: GraphNode['node_type']
  relation: string
  relationType: string
  confidence: number
  evidenceText: string
}

type Props = {
  relations: EdgeRelation[]
  onOpenNode?: (id: string) => void
}

export default function GraphEdgeBlock({ relations, onOpenNode }: Props) {
  return <Card className="edge-relation-block"><div className="card-heading"><span>RELATION EDGES</span><span>{relations.length}</span></div><p className="edge-relation-intro">선택한 노드가 어떤 데이터와 어떤 관계로 연결되어 있는지 보여줍니다.</p>{relations.length ? <div className="edge-relation-list">{relations.map((item) => <button className="edge-relation-item" key={item.id} onClick={() => onOpenNode?.(item.targetId)} disabled={!onOpenNode}><span className="edge-relation-target"><strong>{item.targetLabel}</strong><small>{item.targetType}</small></span><span className="edge-relation-arrow">→</span><span className="edge-relation-name"><strong>{item.relation || item.relationType}</strong><small>{item.relationType} · 신뢰도 {Math.round(item.confidence * 100)}%</small></span>{item.evidenceText && <span className="edge-relation-evidence">{item.evidenceText}</span>}</button>)}</div> : <p className="edge-relation-empty">현재 표시 범위에서 직접 연결된 관계가 없습니다. `청크 포함`을 켜면 문서와 청크 사이의 연결도 확인할 수 있습니다.</p>}</Card>
}
