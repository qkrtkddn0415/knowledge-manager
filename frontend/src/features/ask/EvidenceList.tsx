import type { Reference } from '../../types/search'
import EvidenceCard from './EvidenceCard'

export default function EvidenceList({ references, onOpen }: { references: Reference[]; onOpen: (reference: Reference) => void }) {
  return <div className="evidence-list">{references.map((reference) => <EvidenceCard key={reference.rank + '-' + reference.document_id} reference={reference} onOpen={() => onOpen(reference)} />)}</div>
}
