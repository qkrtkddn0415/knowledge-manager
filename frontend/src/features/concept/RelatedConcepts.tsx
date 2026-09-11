import type { Concept } from '../../types/document'
import ConceptBadge from './ConceptBadge'

export default function RelatedConcepts({ concepts, onSelect }: { concepts: Concept[]; onSelect?: (concept: Concept) => void }) {
  return <div className="related-concepts">{concepts.map((concept) => <button key={concept.id} className="concept-row" onClick={() => onSelect?.(concept)}><span className="concept-orb" /><span><strong>{concept.canonical_name}</strong><small>{concept.description}</small></span><ConceptBadge type={concept.concept_type} /></button>)}</div>
}
