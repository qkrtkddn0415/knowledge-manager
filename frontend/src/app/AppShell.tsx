import type { ReactNode } from 'react'
import type { DocumentSummary } from '../types/document'
import Topbar from '../components/layout/Topbar'
import Sidebar from '../components/layout/Sidebar'
import type { ViewName } from './routes'

export default function AppShell({ view, children, query, documents, onQueryChange, onSearch, onAsk, onAdd, onHome, onLibrary, onHistory, onSettings, onOpenDocument, onOpenAsk }: { view: ViewName; children: ReactNode; query: string; documents: DocumentSummary[]; onQueryChange: (value: string) => void; onSearch: () => void; onAsk: () => void; onAdd: () => void; onHome: () => void; onLibrary: () => void; onHistory: () => void; onSettings: () => void; onOpenDocument: (id: string) => void; onOpenAsk: () => void }) {
  return <div className="app-shell"><Topbar query={query} onQueryChange={onQueryChange} onSearch={onSearch} onAsk={onAsk} onAdd={onAdd} onHome={onHome} onHistory={onHistory} onSettings={onSettings} /><div className="app-body"><Sidebar activeView={view} documents={documents} onOpen={onOpenDocument} onHome={onHome} onLibrary={onLibrary} onAsk={onOpenAsk} onHistory={onHistory} /><main className="main-content">{children}</main></div><footer className="app-footer"><span>SECOND / BRAIN · LOCAL KNOWLEDGE SYSTEM</span><span>NO LOGIN · YOUR DATA, YOUR SPACE</span></footer></div>
}
