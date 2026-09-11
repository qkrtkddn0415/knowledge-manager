import type { DocumentSummary } from '../../types/document'
import DocumentList from '../document/DocumentList'

export default function RecentDocuments({ documents, onOpen }: { documents: DocumentSummary[]; onOpen: (id: string) => void }) {
  return <div className="home-section"><div className="section-title"><span className="eyebrow">RECENT SOURCES</span><span>{documents.length} total</span></div><DocumentList documents={documents.slice(0, 4)} onOpen={onOpen} /></div>
}
