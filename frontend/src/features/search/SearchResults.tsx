import type { SearchResult } from '../../types/search'
import SearchResultCard from './SearchResultCard'
import { EmptyState } from '../../components/ui'

export default function SearchResults({ results, onOpen, onGraph }: { results: SearchResult[]; onOpen: (result: SearchResult) => void; onGraph: (result: SearchResult) => void }) {
  if (!results.length) return <EmptyState eyebrow="NO MATCHES" title="아직 연결된 자료가 없습니다." description="다른 키워드를 사용하거나 새로운 자료를 추가해 보세요." />
  return <div className="search-results"><div className="results-header"><span>RELATED SOURCES</span><strong>{results.length} results</strong></div>{results.map((result) => <SearchResultCard key={result.document_id + result.rank} result={result} onOpen={() => onOpen(result)} onGraph={() => onGraph(result)} />)}</div>
}
