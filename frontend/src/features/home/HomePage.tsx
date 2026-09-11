import type { DocumentDetail, DocumentSummary } from '../../types/document'
import type { GraphData, GraphNode } from '../../types/graph'
import type { HistorySummary } from '../../types/history'
import { Button, Card, EmptyState, LoadingState } from '../../components/ui'
import KnowledgeGraph from '../graph/KnowledgeGraph'
import GraphToolbar from '../graph/GraphToolbar'
import GraphLegend from '../graph/GraphLegend'
import GraphFilters from '../graph/GraphFilters'
import GraphFocus from '../graph/GraphFocus'
import HomeSummary from './HomeSummary'
import RecentDocuments from './RecentDocuments'
import RecentHistory from './RecentHistory'
import ConceptDetail from '../concept/ConceptDetail'

type HomePageProps = {
  graph: GraphData
  documents: DocumentSummary[]
  history: HistorySummary[]
  selectedNode: GraphNode | null
  focusNodeId: string | null
  selectedDocument: DocumentDetail | null
  detailOpen: boolean
  visibleTypes: string[]
  showChunks: boolean
  reducedMotion: boolean
  clusterZoom: number
  fitRequest: number
  arrangeRequest: number
  loading: boolean
  onSelectNode: (node: GraphNode) => void
  onOpenDocument: (id: string) => void
  onOpenHistory: (id: string) => void
  onAdd: () => void
  onArrangeGraph: () => void
  onToggleDetail: () => void
  onResetGraph: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onToggleChunks: () => void
  onToggleMotion: () => void
  onFilter: (types: string[]) => void
}

export default function HomePage({ graph, documents, history, selectedNode, focusNodeId, selectedDocument, detailOpen, visibleTypes, showChunks, reducedMotion, clusterZoom, fitRequest, arrangeRequest, loading, onSelectNode, onOpenDocument, onOpenHistory, onAdd, onArrangeGraph, onToggleDetail, onResetGraph, onZoomIn, onZoomOut, onToggleChunks, onToggleMotion, onFilter }: HomePageProps) {
  const hasData = graph.nodes.length > 0
  const focusedNode = graph.nodes.find((node) => node.id === focusNodeId)
  return <section className="home-view"><div className="hero-copy"><div><span className="eyebrow">PERSONAL KNOWLEDGE GRAPH</span><h1>Everything you know,<br /><em>connected.</em></h1></div><p>흩어진 자료에서 개념과 맥락을 발견하고, 질문으로 다시 꺼내 쓰는 개인 지식 공간입니다.</p></div><HomeSummary documents={documents.length} nodes={graph.counts.concept} connections={graph.edges.length} /><div className="home-main-grid"><Card className="graph-card"><div className="graph-card-header"><div><span className="eyebrow">LIVE MAP / 3D EXPLORER</span><h2>Your knowledge universe</h2></div><GraphLegend /></div><div className="graph-controls"><GraphFilters types={visibleTypes} onChange={onFilter} /><GraphToolbar onReset={onResetGraph} onArrange={onArrangeGraph} canArrange={Boolean(selectedNode)} focused={Boolean(focusNodeId)} detailOpen={detailOpen} onToggleDetail={onToggleDetail} onZoomIn={onZoomIn} onZoomOut={onZoomOut} clusterZoom={clusterZoom} onToggleChunks={onToggleChunks} showChunks={showChunks} reducedMotion={reducedMotion} onReducedMotion={onToggleMotion} /></div>{loading ? <LoadingState label="지식 공간을 불러오는 중" /> : hasData ? <KnowledgeGraph data={graph} selectedId={selectedNode?.id ?? null} focusNodeId={focusNodeId} visibleTypes={visibleTypes} reducedMotion={reducedMotion} clusterZoom={clusterZoom} fitRequest={fitRequest} arrangeRequest={arrangeRequest} onNodeClick={onSelectNode} /> : <EmptyState eyebrow="EMPTY UNIVERSE" title="첫 번째 지식을 연결해 보세요." description="메모나 업무자료를 추가하면 개념과 관계가 이 공간에 나타납니다." action={<Button variant="primary" onClick={onAdd}>＋ 자료 추가</Button>} />}<GraphFocus label={focusedNode?.label} onClear={onResetGraph} /></Card><aside className="home-side"><div className="side-intro"><span className="eyebrow">ORBIT NOTES</span><h2>지식의 주변을<br /><em>탐색하세요.</em></h2><p>노드를 선택하면 원문과 연결된 개념을 바로 확인할 수 있습니다.</p></div><RecentDocuments documents={documents} onOpen={onOpenDocument} /><RecentHistory items={history} onOpen={onOpenHistory} /></aside></div>{selectedDocument && <div className="inline-selection"><ConceptDetail concept={selectedDocument.concepts[0]} related={selectedDocument.concepts.slice(1)} onOpenDocument={() => onOpenDocument(selectedDocument.id)} /></div>}</section>
}
