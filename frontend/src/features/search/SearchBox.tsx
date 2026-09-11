import { Button, Input } from '../../components/ui'

type Props = {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  onAsk: () => void
  loading?: boolean
  askLoading?: boolean
}

export default function SearchBox({ value, onChange, onSearch, onAsk, loading = false, askLoading = false }: Props) {
  return <div className="search-panel-box">
    <span className="search-symbol" aria-hidden="true">⌕</span>
    <Input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSearch()} placeholder="키워드나 문장으로 지식 검색…" aria-label="지식 검색" />
    <Button variant="secondary" onClick={onSearch} disabled={loading || askLoading}>{loading ? '검색 중…' : '검색'}</Button>
    <Button variant="primary" onClick={onAsk} disabled={loading || askLoading || !value.trim()}>{askLoading ? '답변 준비 중…' : '이 결과로 답변'}</Button>
  </div>
}
