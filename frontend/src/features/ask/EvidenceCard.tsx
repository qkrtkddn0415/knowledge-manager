import type { Reference } from '../../types/search'
import { Badge, Button } from '../../components/ui'

export default function EvidenceCard({ reference, onOpen }: { reference: Reference; onOpen: () => void }) {
  const location = reference.local_start_char !== null && reference.local_end_char !== null ? `원문 ${reference.local_start_char.toLocaleString()}–${reference.local_end_char.toLocaleString()}자` : '원문 위치 미확인'
  return <article className={'evidence-card ' + (reference.local_match_type === 'unresolved' ? 'is-unresolved' : '')}><div className="evidence-index">{String(reference.rank).padStart(2, '0')}</div><div className="evidence-content"><div className="evidence-meta"><Badge tone="cyan">{reference.local_match_type === 'unresolved' ? '매핑 불가' : '근거 청크'}</Badge><span>{reference.document_title}</span><span className="evidence-location">{location}</span></div><p>{reference.excerpt}</p><Button variant="ghost" onClick={onOpen} disabled={!reference.url}>원문 위치 보기 →</Button></div></article>
}
