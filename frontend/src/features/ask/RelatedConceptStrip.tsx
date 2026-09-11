import type { Concept } from '../../types/document'

export default function RelatedConceptStrip({ concepts, onSelect }: { concepts: Concept[]; onSelect: (concept: Concept) => void }) {
  return <div className="related-strip"><span className="eyebrow">CONTINUE EXPLORING</span><div>{concepts.map((concept) => <button key={concept.id} onClick={() => onSelect(concept)}>✦ {concept.canonical_name}</button>)}</div></div>
}
