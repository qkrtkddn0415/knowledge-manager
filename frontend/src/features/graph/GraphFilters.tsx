import { Button } from '../../components/ui'

export default function GraphFilters({ types, onChange }: { types: string[]; onChange: (types: string[]) => void }) {
  const options = [{ id: 'document', label: '문서' }, { id: 'concept', label: '개념' }, { id: 'chunk', label: '청크' }]
  return <div className="graph-filters">{options.map((option) => <Button key={option.id} variant={types.includes(option.id) ? 'secondary' : 'ghost'} onClick={() => onChange(types.includes(option.id) ? types.filter((type) => type !== option.id) : [...types, option.id])}>{option.label}</Button>)}</div>
}
