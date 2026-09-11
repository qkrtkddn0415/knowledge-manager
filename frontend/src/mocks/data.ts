import type { DocumentDetail, DocumentSummary, Concept, AnalysisPreview } from '../types/document'
import type { GraphData, GraphEdge, GraphNode } from '../types/graph'
import type { AskRequest, AskResponse, ChatTurn, ConversationDetail, ConversationSummary, Reference, SearchResult } from '../types/search'
import type { HistorySummary } from '../types/history'
import type { AppSettings } from '../types/settings'

const now = '2026-09-09T09:00:00Z'

export const concepts: Concept[] = [
  { id: 'concept-knowledge', concept_type: 'technology', canonical_name: 'Knowledge Graph', korean_name: '지식 그래프', english_name: 'Knowledge Graph', acronym: 'KG', description: '지식 단위와 관계를 연결하는 구조', merge_status: 'confirmed', document_count: 3, chunk_count: 4, related_concept_count: 4 },
  { id: 'concept-rag', concept_type: 'technology', canonical_name: 'Retrieval-Augmented Generation', korean_name: '검색 증강 생성', english_name: 'Retrieval-Augmented Generation', acronym: 'RAG', description: '검색 근거를 바탕으로 답변하는 생성 방식', merge_status: 'confirmed', document_count: 3, chunk_count: 4, related_concept_count: 4 },
  { id: 'concept-obsidian', concept_type: 'technology', canonical_name: 'Obsidian', korean_name: null, english_name: 'Obsidian', acronym: null, description: '연결된 노트와 그래프 탐색 도구', merge_status: 'confirmed', document_count: 1, chunk_count: 1, related_concept_count: 2 },
  { id: 'concept-notebook', concept_type: 'technology', canonical_name: 'NotebookLM', korean_name: null, english_name: 'NotebookLM', acronym: null, description: '참고 자료 기반 AI 리서치 도구', merge_status: 'confirmed', document_count: 1, chunk_count: 1, related_concept_count: 2 },
  { id: 'concept-citation', concept_type: 'policy_law', canonical_name: 'Grounded Citation', korean_name: '근거 인용', english_name: 'Grounded Citation', acronym: null, description: '답변 주장을 원문 근거와 연결하는 규칙', merge_status: 'confirmed', document_count: 2, chunk_count: 2, related_concept_count: 2 },
  { id: 'concept-secondbrain', concept_type: 'project_program', canonical_name: 'Second Brain', korean_name: '세컨드 브레인', english_name: 'Second Brain', acronym: null, description: '개인 지식의 수집·연결·재사용 공간', merge_status: 'confirmed', document_count: 3, chunk_count: 4, related_concept_count: 5 },
  { id: 'concept-chunking', concept_type: 'technology', canonical_name: 'Semantic Chunking', korean_name: '의미 단위 청킹', english_name: 'Semantic Chunking', acronym: null, description: '긴 문서를 검색 가능한 의미 단위로 나누는 방식', merge_status: 'confirmed', document_count: 2, chunk_count: 3, related_concept_count: 2 },
  { id: 'concept-local', concept_type: 'place', canonical_name: 'Local Workspace', korean_name: '로컬 워크스페이스', english_name: 'Local Workspace', acronym: null, description: '개인 컴퓨터에서 자료를 관리하는 공간', merge_status: 'confirmed', document_count: 2, chunk_count: 2, related_concept_count: 2 },
]

const docs: DocumentDetail[] = [
  {
    id: 'doc-1', title: '개인 지식 시스템 설계 노트', source_name: 'knowledge-system.md', source_format: 'md',
    summary: '흩어진 메모를 개념과 관계 중심으로 재구성하는 세컨드 브레인의 방향을 정리한 노트입니다.',
    content_chars: 6840, chunk_count: 1, concept_count: 4, ingest_status: 'ready', created_at: now, updated_at: now,
    content: '세컨드 브레인은 자료를 저장하는 장소가 아니라 다시 생각할 수 있는 공간이어야 한다.\\n\\n문서 사이의 개념을 연결하고, 질문이 들어오면 원문 근거를 찾아 보여주는 흐름이 핵심이다. 그래프는 지식의 구조를 탐색하는 인터페이스로 사용한다.',
    chunks: [{ id: 'chunk-1', document_id: 'doc-1', ordinal: 0, start_char: 0, end_char: 6840, text: '세컨드 브레인은 자료를 저장하는 장소가 아니라 다시 생각할 수 있는 공간이어야 한다. 문서 사이의 개념을 연결하고 원문 근거를 찾아 보여준다.', concept_ids: ['concept-secondbrain', 'concept-knowledge', 'concept-citation', 'concept-local'] }],
    concepts: concepts.filter((concept) => ['concept-secondbrain', 'concept-knowledge', 'concept-citation', 'concept-local'].includes(concept.id)),
    related_documents: [{ document_id: 'doc-2', title: '검색 증강 생성 리서치', reason: '지식 그래프와 근거 기반 답변을 함께 다룸', score: 0.89 }],
  },
  {
    id: 'doc-2', title: '검색 증강 생성 리서치', source_name: 'rag-research.txt', source_format: 'txt',
    summary: '질문을 관련 문서 청크로 먼저 좁힌 후 생성 모델이 근거 기반 답변을 만드는 과정을 정리했습니다.',
    content_chars: 14200, chunk_count: 2, concept_count: 4, ingest_status: 'ready', created_at: '2026-09-08T09:20:00Z', updated_at: now,
    content: '검색 증강 생성은 질문에 가장 관련 있는 자료를 먼저 찾고, 검색 결과를 제한된 컨텍스트로 모델에 제공한다.\\n\\n답변에는 검색 결과의 문서명과 발췌를 함께 표시해야 하며, 근거가 부족하면 부족하다고 알려야 한다.',
    chunks: [
      { id: 'chunk-2', document_id: 'doc-2', ordinal: 0, start_char: 0, end_char: 7200, text: '검색 증강 생성은 질문에 가장 관련 있는 자료를 먼저 찾고, 검색 결과를 제한된 컨텍스트로 모델에 제공한다.', concept_ids: ['concept-rag', 'concept-citation', 'concept-chunking'] },
      { id: 'chunk-3', document_id: 'doc-2', ordinal: 1, start_char: 6700, end_char: 14200, text: '답변에는 검색 결과의 문서명과 발췌를 함께 표시해야 하며, 근거가 부족하면 부족하다고 알려야 한다.', concept_ids: ['concept-rag', 'concept-citation', 'concept-secondbrain'] },
    ],
    concepts: concepts.filter((concept) => ['concept-rag', 'concept-citation', 'concept-chunking', 'concept-secondbrain'].includes(concept.id)),
    related_documents: [{ document_id: 'doc-1', title: '개인 지식 시스템 설계 노트', reason: '개인 지식 검색 경험과 연결됨', score: 0.91 }],
  },
  {
    id: 'doc-3', title: '그래프 인터페이스 벤치마크', source_name: 'graph-benchmark.md', source_format: 'md',
    summary: 'Obsidian의 그래프 탐색과 3D 지식 맵에서 필요한 선택·필터·상세 패널 경험을 비교했습니다.',
    content_chars: 9240, chunk_count: 2, concept_count: 4, ingest_status: 'ready', created_at: '2026-09-07T14:10:00Z', updated_at: '2026-09-07T14:10:00Z',
    content: '그래프는 전체 구조를 보여주지만 모든 정보를 한 번에 읽게 하는 화면은 아니다. 선택한 노드 주변의 맥락을 강조하고, 상세 패널에서 원문으로 연결해야 한다.\\n\\nObsidian은 연결을 탐색하는 감각을 제공하고, NotebookLM은 답변과 출처를 함께 보여준다.',
    chunks: [
      { id: 'chunk-4', document_id: 'doc-3', ordinal: 0, start_char: 0, end_char: 4700, text: '그래프는 전체 구조를 보여주지만 모든 정보를 한 번에 읽게 하는 화면은 아니다. 선택한 노드 주변의 맥락을 강조한다.', concept_ids: ['concept-knowledge', 'concept-obsidian', 'concept-secondbrain'] },
      { id: 'chunk-5', document_id: 'doc-3', ordinal: 1, start_char: 4200, end_char: 9240, text: 'Obsidian은 연결을 탐색하는 감각을 제공하고, NotebookLM은 답변과 출처를 함께 보여준다.', concept_ids: ['concept-obsidian', 'concept-notebook', 'concept-citation'] },
    ],
    concepts: concepts.filter((concept) => ['concept-knowledge', 'concept-obsidian', 'concept-notebook', 'concept-citation'].includes(concept.id)),
    related_documents: [{ document_id: 'doc-1', title: '개인 지식 시스템 설계 노트', reason: '그래프를 지식 탐색 인터페이스로 정의함', score: 0.85 }],
  },
  {
    id: 'doc-4', title: '자료 정리 루틴', source_name: 'capture-routine.txt', source_format: 'txt',
    summary: '자료를 추가하고 제목·요약·개념을 검토하는 개인 정리 루틴입니다.',
    content_chars: 3180, chunk_count: 1, concept_count: 3, ingest_status: 'ready', created_at: '2026-09-05T08:00:00Z', updated_at: '2026-09-05T08:00:00Z',
    content: '새 자료는 원문을 보존한 채 제목과 요약을 먼저 정리한다. 자동 추출된 개념은 저장 전에 확인하고, 불확실한 연결은 나중에 검토할 후보로 남긴다.',
    chunks: [{ id: 'chunk-6', document_id: 'doc-4', ordinal: 0, start_char: 0, end_char: 3180, text: '새 자료는 원문을 보존한 채 제목과 요약을 먼저 정리한다. 자동 추출된 개념은 저장 전에 확인한다.', concept_ids: ['concept-secondbrain', 'concept-local', 'concept-chunking'] }],
    concepts: concepts.filter((concept) => ['concept-secondbrain', 'concept-local', 'concept-chunking'].includes(concept.id)),
    related_documents: [{ document_id: 'doc-1', title: '개인 지식 시스템 설계 노트', reason: '자료 저장과 검토 흐름이 연결됨', score: 0.8 }],
  },
]

export const graph: GraphData = {
  nodes: [
    ...docs.map((doc, index): GraphNode => ({ id: 'node-' + doc.id, node_type: 'document', label: doc.source_name, subtitle: doc.title, concept_type: null, document_id: doc.id, entity_id: doc.id, is_visible_default: true, size: index === 0 ? 8 : 6, color_token: 'accent-blue' })),
    ...concepts.map((concept): GraphNode => ({ id: 'node-' + concept.id, node_type: 'concept', label: concept.canonical_name, subtitle: concept.korean_name, concept_type: concept.concept_type, document_id: null, entity_id: concept.id, is_visible_default: true, size: concept.document_count > 2 ? 7 : 4, color_token: concept.concept_type === 'technology' ? 'accent-cyan' : 'accent-violet' })),
  ],
  edges: [
    ...docs.flatMap((doc) => doc.concepts.map((concept) => ({ id: 'edge-' + doc.id + '-' + concept.id, source: 'node-' + doc.id, target: 'node-' + concept.id, relation_type: 'mentions', label: 'mentions', evidence_chunk_id: doc.chunks[0].id, evidence_text: doc.chunks[0].text, confidence: 0.92 } as GraphEdge))),
    { id: 'edge-rag-graph', source: 'node-concept-rag', target: 'node-concept-knowledge', relation_type: 'supports', label: 'supports', evidence_chunk_id: 'chunk-2', evidence_text: '검색 결과를 제한된 컨텍스트로 모델에 제공한다.', confidence: 0.88 },
    { id: 'edge-obsidian-notebook', source: 'node-concept-obsidian', target: 'node-concept-notebook', relation_type: 'compares_with', label: 'compares with', evidence_chunk_id: 'chunk-5', evidence_text: 'Obsidian은 연결을 탐색하고 NotebookLM은 답변과 출처를 보여준다.', confidence: 0.85 },
  ],
  counts: { document: docs.length, chunk: 0, concept: concepts.length },
  truncated: false,
  focus_node_id: null,
}

let documents = [...docs]
let currentGraph = graph
let chatTurns: Record<string, ChatTurn[]> = {}
let history: HistorySummary[] = [
  { id: 'history-1', question_preview: '세컨드 브레인의 핵심 경험은 무엇인가?', answer_preview: '저장보다 연결과 근거 기반 재사용이 핵심입니다.', answer_status: 'answered', reference_count: 3, created_at: '2026-09-08T12:30:00Z' },
  { id: 'history-2', question_preview: '그래프와 검색은 어떻게 함께 동작해야 하나?', answer_preview: '검색은 빠른 진입점이고 그래프는 맥락 탐색을 돕습니다.', answer_status: 'answered', reference_count: 2, created_at: '2026-09-06T16:05:00Z' },
]

export const mockApi = {
  async getHome() {
    await delay(180)
    return { graph: currentGraph, documents: documents.map(toSummary), history }
  },
  async getDocument(id: string) {
    await delay(140)
    const document = documents.find((item) => item.id === id)
    if (!document) throw new Error('문서를 찾을 수 없습니다.')
    return document
  },
  async deleteDocument(id: string) {
    await delay(160)
    const document = documents.find((item) => item.id === id)
    if (!document) throw new Error('문서를 찾을 수 없습니다.')
    const chunkIds = new Set(document.chunks.map((chunk) => chunk.id))
    const remainingDocuments = documents.filter((item) => item.id !== id)
    const activeConceptIds = new Set(remainingDocuments.flatMap((item) => item.concepts.map((concept) => concept.id)))
    documents = remainingDocuments
    const removedNodeIds = new Set([`node-${id}`, ...document.chunks.map((chunk) => `node-${chunk.id}`)])
    const edges = currentGraph.edges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target) && !chunkIds.has(edge.evidence_chunk_id))
    const nodes = currentGraph.nodes.filter((node) => !removedNodeIds.has(node.id) && (node.node_type !== 'concept' || activeConceptIds.has(node.entity_id)))
    currentGraph = { ...currentGraph, nodes, edges, counts: { document: nodes.filter((node) => node.node_type === 'document').length, chunk: nodes.filter((node) => node.node_type === 'chunk').length, concept: nodes.filter((node) => node.node_type === 'concept').length } }
    return { document_id: id, deleted: true }
  },
  async getNode(id: string) {
    await delay(100)
    if (id.startsWith('node-doc-')) return this.getDocument(id.replace('node-', ''))
    const concept = concepts.find((item) => item.id === id.replace('node-', ''))
    if (!concept) throw new Error('노드를 찾을 수 없습니다.')
    return concept
  },
  async search(query: string): Promise<SearchResult[]> {
    await delay(240)
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return documents
      .map((doc, index) => {
        const haystack = [doc.title, doc.summary ?? '', doc.content, ...doc.concepts.map((concept) => concept.canonical_name)].join(' ').toLowerCase()
        const hits = terms.filter((term) => haystack.includes(term))
        return { doc, hits, score: Math.min(0.98, 0.55 + hits.length * 0.12 - index * 0.025) }
      })
      .filter(({ hits }) => hits.length > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ doc, hits, score }, index) => ({ rank: index + 1, result_type: 'document', document_id: doc.id, chunk_id: doc.chunks[0].id, concept_id: null, title: doc.title, excerpt: doc.chunks[0].text, score, match_type: 'hybrid', matched_terms: hits }))
  },
  async ask(input: AskRequest): Promise<AskResponse> {
    const question = input.question.trim()
    await delay(500)
    const results = await this.search(question)
    const selected = (results.length ? results : documents.slice(0, 3).map((doc, index) => ({ rank: index + 1, result_type: 'document' as const, document_id: doc.id, chunk_id: doc.chunks[0].id, concept_id: null, title: doc.title, excerpt: doc.chunks[0].text, score: 0.82 - index * 0.06, match_type: 'semantic' as const, matched_terms: [] }))).slice(0, 3)
    const references: Reference[] = selected.map((result, index) => ({ rank: index + 1, document_id: result.document_id, document_title: result.title, chunk_id: result.chunk_id, chunk_ordinal: 0, local_start_char: 0, local_end_char: documents.find((document) => document.id === result.document_id)?.chunks[0]?.end_char || result.excerpt.length, excerpt: result.excerpt, score: result.score, local_match_type: 'exact', url: '/api/knowledge/documents/' + result.document_id }))
    const answer = '저장된 자료를 종합하면, 세컨드 브레인의 핵심은 자료를 모으는 데서 끝나지 않고 개념과 관계를 연결해 다시 활용하는 데 있습니다. 검색은 관련 청크를 빠르게 좁히고, AI는 그 근거만으로 짧은 답변을 만듭니다. 그래프는 답변을 검증하거나 예상하지 못한 관련성을 발견하는 탐색 공간으로 작동합니다.'
    const conversationId = input.conversation_id || 'conversation-' + Date.now()
    const turnId = 'history-' + Date.now()
    const createdAt = new Date().toISOString()
    const turnIndex = chatTurns[conversationId]?.length || 0
    const item: HistorySummary = { id: turnId, question_preview: question, answer_preview: answer, answer_status: references.length ? 'answered' : 'insufficient_evidence', reference_count: references.length, conversation_id: conversationId, turn_index: turnIndex, created_at: createdAt }
    history = [item, ...history]
    const response: AskResponse = { conversation_id: conversationId, turn_id: turnId, turn_index: turnIndex, history_id: item.id, question, answer, references, retrieved_count: references.length, insufficient_evidence: references.length < 2, related_concepts: concepts.slice(0, 4), model: 'gpt-5-mini · demo' }
    const turn: ChatTurn = { turn_id: turnId, turn_index: turnIndex, question, answer, answer_status: response.insufficient_evidence ? 'insufficient_evidence' : 'answered', references, retrieved_count: response.retrieved_count, insufficient_evidence: response.insufficient_evidence, related_concepts: response.related_concepts, model: response.model, created_at: createdAt }
    chatTurns = { ...chatTurns, [conversationId]: [...(chatTurns[conversationId] || []), turn] }
    return response
  },
  async analyze(title: string, content: string): Promise<AnalysisPreview> {
    await delay(900)
    const id = 'doc-demo-' + Date.now()
    const chunkId = 'chunk-demo-' + Date.now()
    const selected = concepts.slice(0, 4).map((concept) => ({ ...concept, id: concept.id, temp_key: 'concept-' + concept.id, match_status: 'existing' as const, source_chunk_ids: [chunkId] }))
    return { document_id: id, chunk_count: content.length > 24000 ? 2 : 1, title: title || '새로운 지식 메모', summary: content.slice(0, 180) + (content.length > 180 ? '…' : ''), concepts: selected, relations: [{ temp_key: 'relation-demo', source_key: selected[0].temp_key, target_key: selected[1].temp_key, relation_type: 'relates_to', label: 'relates to', evidence_chunk_id: chunkId, evidence_text: content.slice(0, 120), confidence: 0.86 }] }
  },
  async confirmDocument(preview: AnalysisPreview, content: string, sourceName = 'demo-note.md', sourceFormat = 'md'): Promise<DocumentDetail> {
    await delay(420)
    const normalizedFormat = sourceFormat === 'pdf' ? 'pdf' : sourceFormat === 'txt' ? 'txt' : 'md'
    const document: DocumentDetail = { id: preview.document_id, title: preview.title, source_name: sourceName || 'demo-note.md', source_format: normalizedFormat, summary: preview.summary, content_chars: content.length, chunk_count: preview.chunk_count, concept_count: preview.concepts.length, ingest_status: 'ready', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), content, chunks: [{ id: 'chunk-' + preview.document_id, document_id: preview.document_id, ordinal: 0, start_char: 0, end_char: content.length, text: content, concept_ids: preview.concepts.map((concept) => concept.id) }], concepts: preview.concepts, related_documents: [] }
    documents = [document, ...documents]
    const nodeId = 'node-' + document.id
    const newNode: GraphNode = { id: nodeId, node_type: 'document', label: document.source_name, subtitle: document.title, concept_type: null, document_id: document.id, entity_id: document.id, is_visible_default: true, size: 8, color_token: 'accent-blue' }
    const newEdges = document.concepts.map((concept) => ({ id: 'edge-' + document.id + '-' + concept.id, source: nodeId, target: 'node-' + concept.id, relation_type: 'mentions', label: 'mentions', evidence_chunk_id: document.chunks[0].id, evidence_text: document.chunks[0].text, confidence: 0.9 } as GraphEdge))
    currentGraph = { ...currentGraph, nodes: [newNode, ...currentGraph.nodes], edges: [...newEdges, ...currentGraph.edges], counts: { ...currentGraph.counts, document: currentGraph.counts.document + 1 } }
    return document
  },
  async getHistory() { await delay(120); return history },
  async getConversations(): Promise<ConversationSummary[]> {
    await delay(120)
    const grouped = new Map<string, HistorySummary[]>()
    for (const item of history) {
      const id = item.conversation_id || item.id
      grouped.set(id, [...(grouped.get(id) || []), item])
    }
    return [...grouped.entries()].map(([conversationId, items]) => {
      const turns = [...items].sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0))
      const first = turns[0]
      const latest = turns[turns.length - 1]
      return { conversation_id: conversationId, title: first.question_preview, last_question_preview: latest.question_preview, last_answer_preview: latest.answer_preview, turn_count: turns.length, last_turn_index: latest.turn_index ?? turns.length - 1, created_at: first.created_at, updated_at: latest.created_at }
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  },
  async getConversation(id: string): Promise<ConversationDetail> {
    await delay(140)
    const existing = chatTurns[id] || history.filter((item) => (item.conversation_id || item.id) === id).map((item, index) => ({ turn_id: item.id, turn_index: item.turn_index ?? index, question: item.question_preview, answer: item.answer_preview, answer_status: item.answer_status, references: [], retrieved_count: item.reference_count, insufficient_evidence: item.answer_status === 'insufficient_evidence', related_concepts: [], model: 'demo', created_at: item.created_at }))
    if (!existing.length) throw new Error('대화를 찾을 수 없습니다.')
    const summary = (await this.getConversations()).find((item) => item.conversation_id === id)
    if (!summary) throw new Error('대화를 찾을 수 없습니다.')
    return { ...summary, turns: existing.sort((a, b) => a.turn_index - b.turn_index) }
  },
  async deleteConversation(id: string) {
    await delay(120)
    if (!history.some((item) => (item.conversation_id || item.id) === id)) throw new Error('대화를 찾을 수 없습니다.')
    history = history.filter((item) => (item.conversation_id || item.id) !== id)
    delete chatTurns[id]
    return { conversation_id: id, deleted: true }
  },
  async getSettings(): Promise<AppSettings> { await delay(100); return { onboarding_completed: true, openai_configured: false, vector_store_configured: false, data_directory_label: 'Local workspace / second-brain', export_available: true, theme: 'dark', reduced_motion: false } },
}

function toSummary(document: DocumentDetail): DocumentSummary {
  const { content, chunks, concepts: linkedConcepts, related_documents, ...summary } = document
  void content
  void chunks
  void linkedConcepts
  void related_documents
  return summary
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
