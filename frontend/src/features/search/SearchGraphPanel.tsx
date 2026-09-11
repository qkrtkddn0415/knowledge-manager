import type { GraphData, GraphNode } from '../../types/graph'
import type { SearchResult } from '../../types/search'
import KnowledgeGraph from '../graph/KnowledgeGraph'

type Props = {
  graph: GraphData
  results: SearchResult[]
  onOpenNode: (node: GraphNode) => void
}

type RelationView = {
  id: string
  source: GraphNode
  target: GraphNode
  label: string
}

export default function SearchGraphPanel({ graph, results, onOpenNode }: Props) {
  const activeNodes = graph.nodes.filter((node) => results.some((result) => matchesResult(node, result)))
  const listedActiveNodes = [...new Map(activeNodes.map((node) => [node.canonical_id || node.entity_id, node])).values()]
  const activeIds = activeNodes.map((node) => node.id)
  const activeIdSet = new Set(activeIds)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const relations = graph.edges
    .filter((edge) => activeIdSet.has(edge.source) || activeIdSet.has(edge.target))
    .map((edge): RelationView | null => {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      return source && target ? { id: edge.id, source, target, label: edge.label || edge.relation_type } : null
    })
    .filter((relation): relation is RelationView => Boolean(relation))
    .slice(0, 10)

  if (!activeNodes.length || !graph.nodes.length) return null

  return <section className="search-graph-panel" aria-label="검색 영향 지식그래프">
    <div className="search-graph-heading">
      <div>
        <span className="eyebrow">SEARCH IMPACT MAP</span>
        <h2>검색어가 닿은 지식</h2>
        <p>밝게 표시된 노드는 검색 결과에 직접 포함되고, 주변 노드와 선은 그 결과가 그래프에서 어떤 맥락으로 연결되는지 보여줍니다.</p>
      </div>
      <div className="search-graph-stats"><strong>{listedActiveNodes.length}</strong><span>활성 노드</span><strong>{relations.length}</strong><span>연결 관계</span></div>
    </div>
    <div className="search-graph-layout">
      <div className="search-graph-stage"><KnowledgeGraph data={graph} selectedId={null} focusNodeId={null} highlightedIds={activeIds} visibleTypes={['document', 'concept']} reducedMotion={true} clusterZoom={0.82} fitRequest={results.length} arrangeRequest={0} onNodeClick={onOpenNode} /></div>
      <aside className="search-relation-panel">
        <div className="search-relation-heading"><span className="eyebrow">ACTIVE CONTEXT</span><strong>검색 결과의 연결</strong></div>
        <div className="search-active-nodes">{listedActiveNodes.slice(0, 8).map((node) => <button key={node.id} onClick={() => onOpenNode(node)}><i className={node.node_type === 'document' ? 'is-document' : 'is-concept'} /><span>{node.label}</span><small>{node.node_type}</small></button>)}</div>
        {relations.length ? <div className="search-relation-list">{relations.map((relation) => <button key={relation.id} onClick={() => onOpenNode(relation.target)}><span>{relation.source.label}</span><b>{relation.label}</b><span>{relation.target.label}</span></button>)}</div> : <p className="search-relation-empty">검색 일치 노드 사이에 저장된 관계가 없습니다. 노드를 열어 원문과 연결 개념을 확인하세요.</p>}
        <p className="search-graph-help">노드를 클릭하면 상세 정보와 관계 근거를 엽니다.</p>
      </aside>
    </div>
  </section>
}

function matchesResult(node: GraphNode, result: SearchResult) {
  return node.entity_id === result.document_id
    || Boolean(result.chunk_id && node.entity_id === result.chunk_id)
    || Boolean(result.concept_id && (node.entity_id === result.concept_id || node.canonical_id === result.concept_id))
}
