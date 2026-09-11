import type { DocumentSummary } from '../../types/document'
import { Button, EmptyState } from '../../components/ui'
import DocumentList from '../document/DocumentList'

export default function LibraryPage({ documents, onOpen, onAdd }: { documents: DocumentSummary[]; onOpen: (id: string) => void; onAdd: () => void }) {
  return <section className="content-view library-page"><div className="page-heading"><span className="eyebrow">SOURCE LIBRARY</span><h1>자료 라이브러리.</h1><p>저장된 원본 자료와 지식화 상태를 한곳에서 확인합니다.</p></div><div className="library-toolbar"><span className="eyebrow">{documents.length} SOURCES</span><Button variant="primary" onClick={onAdd}>＋ 자료 추가</Button></div>{documents.length ? <DocumentList documents={documents} onOpen={onOpen} /> : <EmptyState eyebrow="EMPTY LIBRARY" title="아직 자료가 없습니다." description="텍스트나 PDF 자료를 추가하면 지식그래프와 AI 대화에서 사용할 수 있습니다." action={<Button variant="primary" onClick={onAdd}>＋ 첫 자료 추가</Button>} />}</section>
}
