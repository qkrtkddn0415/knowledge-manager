export default function GraphFocus({ label, onClear }: { label?: string; onClear: () => void }) {
  return label ? <button className="focus-chip" onClick={onClear}>FOCUS · {label} ×</button> : null
}
