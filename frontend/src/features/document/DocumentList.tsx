import type { DocumentSummary } from '../../types/document'
import { Badge } from '../../components/ui'

export default function DocumentList({ documents, onOpen }: { documents: DocumentSummary[]; onOpen: (id: string) => void }) {
  return <div className="document-list">{documents.map((document) => <button className="document-row" key={document.id} onClick={() => onOpen(document.id)}><span className="document-icon">▤</span><span><strong>{document.title}</strong><small>{document.source_name} · {document.chunk_count} chunks</small></span><Badge tone={document.ingest_status === 'ready' ? 'green' : 'amber'}>{document.ingest_status}</Badge></button>)}</div>
}
