import type { SearchResult } from '../../types/search'
import { Badge } from '../../components/ui'

export default function SearchResultCard({ result, onOpen, onGraph }: { result: SearchResult; onOpen: () => void; onGraph: () => void }) {
  return <article className="search-result-card"><div className="result-card-top"><Badge tone={result.result_type === 'concept' ? 'violet' : 'cyan'}>{result.result_type}</Badge><span>{Math.round(result.score * 100)}% match</span></div><button className="result-card-main" onClick={onOpen}><h3>{result.title}</h3><p>{result.excerpt}</p><div className="result-terms">{result.matched_terms.map((term) => <span key={term}>{term}</span>)}</div></button><div className="result-card-actions"><button onClick={onGraph}>그래프에서 보기 ↗</button><span>CHUNK {result.rank}</span></div></article>
}
