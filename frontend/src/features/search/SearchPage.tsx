import type { SearchResult } from '../../types/search'
import type { GraphData, GraphNode } from '../../types/graph'
import { ErrorState, LoadingState } from '../../components/ui'
import SearchBox from './SearchBox'
import SearchResults from './SearchResults'
import SearchGraphPanel from './SearchGraphPanel'

type Props = {
  query: string
  results: SearchResult[]
  loading: boolean
  error: Error | null
  onQueryChange: (value: string) => void
  onSearch: () => void
  onAsk: (documentIds?: string[]) => void
  askLoading?: boolean
  onOpen: (result: SearchResult) => void
  onGraph: (result: SearchResult) => void
  graph: GraphData
  onOpenNode: (node: GraphNode) => void
}

export default function SearchPage({ query, results, loading, error, onQueryChange, onSearch, onAsk, askLoading = false, onOpen, onGraph, graph, onOpenNode }: Props) {
  return <section className="content-view">
    <div className="page-heading"><span className="eyebrow">SEARCH THE UNIVERSE</span><h1>Find the thread.</h1><p>키워드 검색은 저장된 원문·청크·개념을 찾고, AI 답변은 관련 근거를 최대 3개 사용해 요약합니다.</p></div>
    <SearchBox value={query} onChange={onQueryChange} onSearch={onSearch} onAsk={() => onAsk([...new Set(results.map((result) => result.document_id).filter(Boolean))])} loading={loading} askLoading={askLoading} />
    <div className="search-mode-note"><strong>검색</strong><span>원문과 개념을 바로 찾습니다.</span><strong>이 결과로 답변</strong><span>관련 근거를 AI가 정리하고 참고 문서를 표시합니다.</span></div>
    {loading ? <LoadingState label="저장된 지식에서 관련 자료를 찾는 중…" /> : error ? <ErrorState error={error} onRetry={onSearch} /> : <><SearchGraphPanel graph={graph} results={results} onOpenNode={onOpenNode} /><SearchResults results={results} onOpen={onOpen} onGraph={onGraph} /></>}
  </section>
}
