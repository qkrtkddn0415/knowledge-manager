import { useCallback, useEffect, useState } from 'react'
import type { DocumentDetail, DocumentSummary, Concept } from '../types/document'
import type { GraphData, GraphNode } from '../types/graph'
import type { EdgeRelation } from '../features/graph/GraphEdgeBlock'
import type { HistorySummary } from '../types/history'
import type { ChatTurn, ConversationSummary, Reference, SearchResult } from '../types/search'
import type { AgentResult } from '../types/agent'
import { mockApi } from '../mocks/data'
import { api } from '../api/client'
import { navigate, getView, type ViewName } from './routes'
import AppShell from './AppShell'
import HomePage from '../features/home/HomePage'
import SearchPage from '../features/search/SearchPage'
import AskPage from '../features/ask/AskPage'
import HistoryPage from '../features/history/HistoryPage'
import LibraryPage from '../features/library/LibraryPage'
import SettingsPage from '../features/settings/SettingsPage'
import AddDocumentModal from '../features/ingestion/AddDocumentModal'
import DocumentDrawer from '../features/document/DocumentDrawer'
import ConceptDetail from '../features/concept/ConceptDetail'
import { Drawer, ErrorState } from '../components/ui'
import useAgentRun from '../features/agent/useAgentRun'
import './app.css'

const emptyGraph: GraphData = { nodes: [], edges: [], counts: { document: 0, chunk: 0, concept: 0 }, truncated: false, focus_node_id: null }

function documentSummary(document: DocumentDetail): DocumentSummary {
  const { content, chunks, concepts, related_documents, ...summary } = document
  void content; void chunks; void concepts; void related_documents
  return summary
}

function edgeRelations(graph: GraphData, selectedNode: GraphNode | null): EdgeRelation[] {
  if (!selectedNode) return []
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const selectedIds = new Set([selectedNode.id, selectedNode.canonical_id].filter((id): id is string => Boolean(id)))
  return graph.edges.filter((edge) => selectedIds.has(edge.source) || selectedIds.has(edge.target)).map((edge) => {
    const targetId = selectedIds.has(edge.source) ? edge.target : edge.source
    const target = nodeById.get(targetId)
    if (!target) return null
    return { id: edge.id, targetId, targetLabel: target.label, targetType: target.node_type, relation: edge.label, relationType: edge.relation_type, confidence: edge.confidence, evidenceText: edge.evidence_text }
  }).filter((relation): relation is EdgeRelation => Boolean(relation))
}

function mapHistoryItem(item: Record<string, unknown>): HistorySummary {
  return { id: String(item.id || ''), question_preview: String(item.query || item.question_preview || ''), answer_preview: String(item.answer || item.answer_preview || ''), answer_status: item.answer_status === 'failed' ? 'failed' : item.insufficient_evidence ? 'insufficient_evidence' : 'answered', reference_count: Number(item.retrieved_count || item.reference_count || 0), conversation_id: item.conversation_id ? String(item.conversation_id) : null, turn_index: item.turn_index === null || item.turn_index === undefined ? null : Number(item.turn_index), created_at: String(item.created_at || new Date().toISOString()) }
}

const liveApi = import.meta.env.VITE_USE_API !== 'false'

async function getLiveSnapshot() {
  if (!liveApi) return null
  const [liveGraph, liveDocuments, liveHistory, liveConversations] = await Promise.all([
    api.getGraph('?node_types=document,chunk,concept&include_hidden=true') as Promise<GraphData>,
    api.getDocuments('?page=1&page_size=100') as Promise<DocumentSummary[]>,
    api.getHistory('?page=1&page_size=100') as Promise<Array<Record<string, unknown>>>,
    api.getConversations('?page=1&page_size=100'),
  ])
  const history: HistorySummary[] = liveHistory.map(mapHistoryItem)
  return { graph: liveGraph, documents: liveDocuments, history, conversations: liveConversations }
}

function appendDocumentToGraph(current: GraphData, document: DocumentDetail): GraphData {
  if (current.nodes.some((node) => node.entity_id === document.id)) return current
  const documentNodeId = 'node-' + document.id
  const nodes = [...current.nodes, { id: documentNodeId, node_type: 'document' as const, label: document.title, subtitle: document.source_name, concept_type: null, document_id: document.id, entity_id: document.id, is_visible_default: true, size: 12, color_token: 'accent-blue' }]
  const existingConceptIds = new Set(current.nodes.filter((node) => node.node_type === 'concept').map((node) => node.entity_id))
  const conceptNodes = document.concepts.filter((concept) => !existingConceptIds.has(concept.id)).map((concept) => ({ id: 'node-' + concept.id, node_type: 'concept' as const, label: concept.canonical_name, subtitle: concept.korean_name || concept.english_name, concept_type: concept.concept_type, document_id: null, entity_id: concept.id, is_visible_default: true, size: 8, color_token: concept.concept_type === 'technology' ? 'accent-cyan' : 'accent-violet' }))
  nodes.push(...conceptNodes)
  const edges = [...current.edges]
  if (document.chunks.length > 1) {
    const chunkNodes = document.chunks.map((chunk) => ({ id: 'node-' + chunk.id, node_type: 'chunk' as const, label: `Chunk ${chunk.ordinal + 1}`, subtitle: chunk.text.slice(0, 90), concept_type: null, document_id: document.id, entity_id: chunk.id, is_visible_default: false, size: 6, color_token: 'accent-teal' }))
    nodes.push(...chunkNodes)
    for (const chunk of document.chunks) {
      edges.push({ id: `edge-${document.id}-${chunk.id}`, source: documentNodeId, target: 'node-' + chunk.id, relation_type: 'contains', label: 'contains', evidence_chunk_id: chunk.id, evidence_text: chunk.text.slice(0, 200), confidence: 1 })
      const conceptIds = chunk.concept_ids.length ? chunk.concept_ids : document.concepts.map((concept) => concept.id)
      for (const conceptId of conceptIds) edges.push({ id: `edge-${chunk.id}-${conceptId}`, source: 'node-' + chunk.id, target: 'node-' + conceptId, relation_type: 'mentions', label: 'mentions', evidence_chunk_id: chunk.id, evidence_text: chunk.text.slice(0, 200), confidence: .9 })
    }
  } else {
    for (const concept of document.concepts) edges.push({ id: `edge-${document.id}-${concept.id}`, source: documentNodeId, target: 'node-' + concept.id, relation_type: 'mentions', label: 'mentions', evidence_chunk_id: document.chunks[0]?.id || '', evidence_text: document.chunks[0]?.text.slice(0, 200) || '', confidence: .9 })
  }
  const conceptByKey = new Map((document.analysis?.concepts || []).map((item) => [item.key || '', document.concepts.find((concept) => concept.canonical_name === item.canonical_name)]))
  for (const relation of document.analysis?.relations || []) {
    const source = conceptByKey.get(relation.source_key)
    const target = conceptByKey.get(relation.target_key)
    if (!source || !target) continue
    const evidence = document.chunks[relation.source_ordinal || 0]
    edges.push({ id: `relation-${document.id}-${relation.source_key}-${relation.target_key}`, source: 'node-' + source.id, target: 'node-' + target.id, relation_type: relation.relation_type, label: relation.label, evidence_chunk_id: evidence?.id || '', evidence_text: relation.evidence || evidence?.text.slice(0, 200) || '', confidence: relation.confidence })
  }
  return { ...current, nodes, edges, counts: { document: current.counts.document + 1, chunk: current.counts.chunk + (document.chunks.length > 1 ? document.chunks.length : 0), concept: current.counts.concept + conceptNodes.length } }
}

export default function App() {
  const [view, setView] = useState<ViewName>(getView())
  const [graph, setGraph] = useState<GraphData>(emptyGraph)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [history, setHistory] = useState<HistorySummary[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [query, setQuery] = useState(new URLSearchParams(window.location.search).get('q') || '')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<Error | null>(null)
  const [question, setQuestion] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null)
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null)
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>(null)
  const [highlightedStart, setHighlightedStart] = useState<number | null>(null)
  const [highlightedEnd, setHighlightedEnd] = useState<number | null>(null)
  const [documentCache, setDocumentCache] = useState<Record<string, DocumentDetail>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [askLoading, setAskLoading] = useState(false)
  const [askStarting, setAskStarting] = useState(false)
  const [askError, setAskError] = useState<Error | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [visibleTypes, setVisibleTypes] = useState<string[]>(['document', 'concept'])
  const [showChunks, setShowChunks] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const [clusterZoom, setClusterZoom] = useState(1)
  const [fitRequest, setFitRequest] = useState(0)
  const [arrangeRequest, setArrangeRequest] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const go = (next: ViewName, nextQuery?: string) => { setView(next); navigate(next, nextQuery) }

  const onAgentComplete = useCallback(async (next: AgentResult) => {
    const localReferences: Reference[] = next.references.filter((reference) => reference.source_type !== 'web').map((reference) => ({ ...reference, document_id: reference.document_id || '', document_title: reference.document_title || reference.title || '', chunk_id: reference.chunk_id, local_match_type: reference.local_match_type as Reference['local_match_type'], url: reference.url }))
    const nextTurn: ChatTurn = { turn_id: next.turn_id || next.history_id || `turn-${Date.now()}`, turn_index: next.turn_index ?? turns.length, question: next.question, answer: next.answer || '', answer_status: next.status === 'failed' ? 'failed' : next.insufficient_evidence ? 'insufficient_evidence' : 'answered', references: localReferences, web_references: next.web_references as Reference[], retrieved_count: next.retrieved_count, insufficient_evidence: next.insufficient_evidence, related_concepts: next.related_concepts || [], model: next.model, created_at: next.finished_at || new Date().toISOString() }
    setConversationId(next.conversation_id)
    setTurns((current) => [...current, nextTurn])
    if (liveApi) {
      const [nextHistory, nextConversations] = await Promise.all([api.getHistory('?page=1&page_size=100') as Promise<Array<Record<string, unknown>>>, api.getConversations('?page=1&page_size=100')])
      setHistory(nextHistory.map(mapHistoryItem)); setConversations(nextConversations)
    }
    go('ask')
  }, [turns.length])

  const agent = useAgentRun({ onComplete: onAgentComplete })

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const live = await getLiveSnapshot()
      if (live) { setGraph(live.graph); setDocuments(live.documents); setHistory(live.history); setConversations(live.conversations) }
      else { const home = await mockApi.getHome(); setGraph(home.graph); setDocuments(home.documents); setHistory(home.history); setConversations(await mockApi.getConversations()) }
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason : new Error('데모 데이터를 불러오지 못했습니다.')) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh(); const onPopState = () => setView(getView()); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState) }, [refresh])
  const openDocument = async (id: string, reference?: Reference) => { setSelectedConcept(null); const document = documentCache[id] || (liveApi ? await api.getDocument(id).catch(() => mockApi.getDocument(id)) as Promise<DocumentDetail> : await mockApi.getDocument(id)); const matchedChunk = reference ? document.chunks.find((chunk) => chunk.id === reference.chunk_id || chunk.ordinal === reference.chunk_ordinal) : null; setHighlightedChunkId(matchedChunk?.id || null); setHighlightedStart(reference?.local_start_char ?? matchedChunk?.start_char ?? null); setHighlightedEnd(reference?.local_end_char ?? matchedChunk?.end_char ?? null); setSelectedDocument(document); setSelectedNode(graph.nodes.find((node) => node.entity_id === id) || null); setDetailOpen(true) }
  const openNode = async (node: GraphNode) => { setSelectedNode(node); setDetailOpen(true); if (node.node_type !== 'concept') await openDocument(node.document_id || node.entity_id); else { setSelectedDocument(null); const cachedConcept = Object.values(documentCache).flatMap((document) => document.concepts).find((concept) => concept.id === node.entity_id); const sourceNodeId = node.canonical_id || node.id; const liveConcept = liveApi ? await api.getNode(sourceNodeId).then((value) => (value as { node?: Concept }).node).catch(() => null) : null; setSelectedConcept(cachedConcept || liveConcept || await mockApi.getNode(sourceNodeId) as Concept) } }
  const openGraphNode = (id: string) => { const node = graph.nodes.find((item) => item.id === id); if (node) void openNode(node) }
  const selectConcept = (concept: Concept) => { setSelectedDocument(null); setSelectedConcept(concept); setSelectedNode(graph.nodes.find((node) => node.node_type === 'concept' && node.entity_id === concept.id) || null); setDetailOpen(true) }
  const runSearch = async () => {
    const nextQuery = query.trim()
    if (!nextQuery || searchLoading) return
    setSearchLoading(true)
    setSearchError(null)
    setResults([])
    go('search', 'q=' + encodeURIComponent(nextQuery))
    try {
      const nextResults = liveApi ? await api.search(nextQuery) as SearchResult[] : await mockApi.search(nextQuery)
      setResults(nextResults)
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason : new Error('검색 중 오류가 발생했습니다.'))
    } finally {
      setSearchLoading(false)
    }
  }
  const runAsk = async (input?: string, documentIds: string[] = []) => {
    const nextQuestion = input?.trim() || question.trim() || query.trim()
    if (!nextQuestion || (liveApi ? agent.loading : askLoading)) return
    if (liveApi) {
      setAskStarting(true); setQuestion(''); setAskError(null); go('ask')
      try { await agent.start(nextQuestion, conversationId, documentIds) } finally { setAskStarting(false) }
      return
    }
    setQuestion(''); setAskLoading(true); setAskError(null); go('ask')
    try {
      const next = liveApi ? await api.ask({ question: nextQuestion, conversation_id: conversationId }) : await mockApi.ask({ question: nextQuestion, conversation_id: conversationId })
      const nextTurn: ChatTurn = { turn_id: next.turn_id || next.history_id || `turn-${Date.now()}`, turn_index: next.turn_index ?? turns.length, question: next.question, answer: next.answer, answer_status: next.insufficient_evidence ? 'insufficient_evidence' : 'answered', references: next.references, retrieved_count: next.retrieved_count, insufficient_evidence: next.insufficient_evidence, related_concepts: next.related_concepts, model: next.model, created_at: new Date().toISOString() }
      setConversationId(next.conversation_id); setTurns((current) => [...current, nextTurn])
      if (liveApi) {
        const nextHistory = await api.getHistory('?page=1&page_size=100') as Array<Record<string, unknown>>
        setHistory(nextHistory.map(mapHistoryItem))
      } else {
        setHistory(await mockApi.getHistory())
      }
      setConversations(await (liveApi ? api.getConversations('?page=1&page_size=100') : mockApi.getConversations()))
      go('ask')
    } catch (reason) { setAskError(reason instanceof Error ? reason : new Error('질문 처리 중 오류가 발생했습니다.')) } finally { setAskLoading(false) }
  }
  const openConversation = async (id: string) => {
    setBusy(true)
    try {
      const detail = liveApi ? await api.getConversation(id).catch(() => mockApi.getConversation(id)) : await mockApi.getConversation(id)
      setConversationId(detail.conversation_id); setTurns(detail.turns.map((turn) => ({ ...turn, related_concepts: turn.related_concepts || [] })))
      setQuestion(''); go('ask')
    } catch (reason) { setError(reason instanceof Error ? reason : new Error('대화를 불러오지 못했습니다.')) } finally { setBusy(false) }
  }
  const startNewConversation = () => { agent.reset(); setAskStarting(false); setConversationId(null); setTurns([]); setQuestion(''); setAskError(null) }
  const openSearchResult = async (result: SearchResult) => {
    if (result.document_id) return openDocument(result.document_id)
    if (result.concept_id) {
      const node = graph.nodes.find((item) => item.node_type === 'concept' && item.entity_id === result.concept_id)
      if (node) return openNode(node)
    }
  }
  const focusSearchResult = (result: SearchResult) => {
    const targetId = result.concept_id || result.chunk_id || result.document_id
    const node = graph.nodes.find((item) => item.id === targetId || item.entity_id === targetId || item.canonical_id === targetId)
    if (!node) return
    setSelectedNode(node)
    setFocusNodeId(node.id)
    setArrangeRequest((value) => value + 1)
    go('home')
  }
  const importWebSource = async (reference: Reference) => {
    if (!liveApi || !reference.url) return
    const accepted = await api.importWebSource({ url: reference.url, title: reference.title || reference.document_title, excerpt: reference.snippet })
    const poll = async () => {
      const job = await api.getIngestion(accepted.job_id) as { status?: string }
      if (['succeeded', 'failed', 'cancelled'].includes(job.status || '')) { if (job.status === 'succeeded') await refresh(); return }
      window.setTimeout(() => void poll(), 1000)
    }
    void poll()
  }
  const onDocumentAdded = async (document: DocumentDetail) => {
    setDocumentCache((current) => ({ ...current, [document.id]: document }))
    const live = await getLiveSnapshot().catch(() => null)
    if (live && live.documents.some((item) => item.id === document.id)) { setGraph(live.graph); setDocuments(live.documents); setHistory(live.history); setConversations(live.conversations) }
    else { setDocuments((current) => [documentSummary(document), ...current.filter((item) => item.id !== document.id)]); setGraph((current) => appendDocumentToGraph(current, document)) }
    setSelectedDocument(null); go('home')
  }
  const deleteSelectedDocument = async () => {
    if (!selectedDocument || busy) return
    if (!window.confirm(`자료 '${selectedDocument.title}'을(를) 삭제하시겠습니까? 연결된 근거 엣지도 그래프에서 제거됩니다.`)) return
    setBusy(true)
    try {
      const result = liveApi ? await api.deleteDocument(selectedDocument.id) : await mockApi.deleteDocument(selectedDocument.id)
      const jobId = 'job_id' in result ? result.job_id : undefined
      if (liveApi && jobId) {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 200))
          const state = await api.getIngestion(jobId) as { status?: string; error?: { message?: string } | null }
          if (state.status === 'succeeded') break
          if (state.status === 'failed') throw new Error(state.error?.message || '자료 삭제에 실패했습니다.')
        }
      }
      if (liveApi) {
        const live = await getLiveSnapshot()
        if (live) { setGraph(live.graph); setDocuments(live.documents); setHistory(live.history); setConversations(live.conversations) }
      } else {
        const home = await mockApi.getHome()
        setGraph(home.graph); setDocuments(home.documents); setHistory(home.history)
      }
      setDocumentCache((current) => { const next = { ...current }; delete next[selectedDocument.id]; return next })
      setSelectedDocument(null); setSelectedConcept(null); setSelectedNode(null); setDetailOpen(false); go('home')
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('자료 삭제에 실패했습니다.'))
    } finally { setBusy(false) }
  }
  const onResetGraph = () => { setSelectedNode(null); setSelectedDocument(null); setSelectedConcept(null); setDetailOpen(false); setFocusNodeId(null); setVisibleTypes(['document', 'concept']); setShowChunks(false); setClusterZoom(1); setFitRequest((value) => value + 1) }
  const arrangeSelectedNode = () => { if (selectedNode) { setFocusNodeId(selectedNode.id); setArrangeRequest((value) => value + 1) } }
  const onArrangeGraph = () => { if (!selectedNode) return; if (focusNodeId === selectedNode.id) { setFocusNodeId(null); setFitRequest((value) => value + 1) } else arrangeSelectedNode() }

  if (error) return <div className="standalone-state"><ErrorState error={error} onRetry={() => void refresh()} /></div>
  return <>
    <AppShell view={view} query={query} documents={documents} onQueryChange={setQuery} onSearch={() => void runSearch()} onAsk={() => void runAsk()} onAdd={() => setAddOpen(true)} onHome={() => go('home')} onLibrary={() => go('library')} onHistory={() => go('history')} onSettings={() => go('settings')} onOpenDocument={(id) => void openDocument(id)} onOpenAsk={() => go('ask')}>
      {view === 'home' && <HomePage graph={graph} documents={documents} history={history} selectedNode={selectedNode} focusNodeId={focusNodeId} selectedDocument={null} detailOpen={detailOpen} visibleTypes={showChunks ? [...visibleTypes, 'chunk'] : visibleTypes} showChunks={showChunks} reducedMotion={reducedMotion} clusterZoom={clusterZoom} fitRequest={fitRequest} arrangeRequest={arrangeRequest} loading={loading} onSelectNode={(node) => void openNode(node)} onOpenDocument={(id) => void openDocument(id)} onOpenHistory={() => go('history')} onAdd={() => setAddOpen(true)} onArrangeGraph={onArrangeGraph} onToggleDetail={() => setDetailOpen((value) => !value)} onResetGraph={onResetGraph} onZoomIn={() => setClusterZoom((value) => Math.min(1.6, Number((value + .2).toFixed(1))))} onZoomOut={() => setClusterZoom((value) => Math.max(.6, Number((value - .2).toFixed(1))))} onToggleChunks={() => setShowChunks((value) => !value)} onToggleMotion={() => setReducedMotion((value) => !value)} onFilter={setVisibleTypes} />}
      {view === 'search' && <SearchPage query={query} results={results} loading={searchLoading} askLoading={liveApi ? agent.loading || askStarting : askLoading} error={searchError} onQueryChange={setQuery} onSearch={() => void runSearch()} onAsk={(documentIds) => void runAsk(query, documentIds)} onOpen={(result) => void openSearchResult(result)} onGraph={focusSearchResult} graph={graph} onOpenNode={(node) => void openNode(node)} />}
      {view === 'ask' && <AskPage question={question} turns={turns} conversationId={conversationId} loading={liveApi ? agent.loading || askStarting : askLoading} error={liveApi ? agent.error : askError} agentEvents={agent.events} agentStatus={agent.status} onCancelAgent={() => void agent.cancel()} onQuestionChange={setQuestion} onAsk={() => void runAsk()} onNewConversation={startNewConversation} onOpenReference={(reference) => void openDocument(reference.document_id, reference)} onSelectConcept={selectConcept} onImportWebSource={importWebSource} />}
      {view === 'history' && <HistoryPage items={history} conversations={conversations} onOpen={(id) => void openConversation(id)} />}
      {view === 'library' && <LibraryPage documents={documents} onOpen={(id) => void openDocument(id)} onAdd={() => setAddOpen(true)} />}
      {view === 'settings' && <SettingsPage onBack={() => go('home')} />}
    </AppShell>
    <AddDocumentModal open={addOpen} onClose={() => setAddOpen(false)} onComplete={(document) => void onDocumentAdded(document)} onExplore={() => go('home')} />
    <DocumentDrawer document={detailOpen ? selectedDocument : null} highlightedChunkId={highlightedChunkId} highlightedStart={highlightedStart} highlightedEnd={highlightedEnd} onClose={() => setDetailOpen(false)} onOpenConcept={(id) => { const concept = selectedDocument?.concepts.find((item) => item.id === id); if (concept) selectConcept(concept) }} onOpenRelated={(id) => void openDocument(id)} onArrange={arrangeSelectedNode} onDelete={busy ? undefined : () => void deleteSelectedDocument()} relations={edgeRelations(graph, selectedNode)} onOpenGraphNode={openGraphNode} />
    <Drawer open={detailOpen && Boolean(selectedConcept)} title="Concept detail" onClose={() => setDetailOpen(false)}>{selectedConcept && <ConceptDetail concept={selectedConcept} related={graph.nodes.filter((node) => node.node_type === 'concept').slice(0, 4).map((node) => ({ ...selectedConcept, id: node.entity_id, canonical_name: node.label })).filter((concept) => concept.id !== selectedConcept.id)} onOpenDocument={() => { const doc = documents.find((item) => item.concept_count > 0); if (doc) void openDocument(doc.id) }} onSelectConcept={selectConcept} onArrange={arrangeSelectedNode} relations={edgeRelations(graph, selectedNode)} onOpenGraphNode={openGraphNode} />}</Drawer>
  </>
}
