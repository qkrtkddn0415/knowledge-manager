import type { DocumentDetail as DocumentDetailType } from '../../types/document'
import { Drawer } from '../../components/ui'
import DocumentDetail from './DocumentDetail'
import type { EdgeRelation } from '../graph/GraphEdgeBlock'

export default function DocumentDrawer({ document, highlightedChunkId, highlightedStart, highlightedEnd, onClose, onOpenConcept, onOpenRelated, onArrange, onDelete, relations, onOpenGraphNode }: { document: DocumentDetailType | null; highlightedChunkId?: string | null; highlightedStart?: number | null; highlightedEnd?: number | null; onClose: () => void; onOpenConcept: (id: string) => void; onOpenRelated: (id: string) => void; onArrange: () => void; onDelete?: () => void; relations?: EdgeRelation[]; onOpenGraphNode?: (id: string) => void }) {
  if (!document) return null
  return <Drawer open title="Document detail" onClose={onClose}><DocumentDetail document={document} highlightedChunkId={highlightedChunkId} highlightedStart={highlightedStart} highlightedEnd={highlightedEnd} onOpenConcept={(concept) => onOpenConcept(concept.id)} onOpenRelated={onOpenRelated} onArrange={onArrange} onDelete={onDelete} relations={relations} onOpenGraphNode={onOpenGraphNode} /></Drawer>
}
