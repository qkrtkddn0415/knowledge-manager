import type { ConceptType } from '../../types/document'
import { Badge } from '../../components/ui'

const labels: Record<ConceptType, string> = {
  organization: '조직', organization_unit: '조직 단위', person: '인물', country: '국가', region: '지역', place: '장소', technology: '기술', equipment: '장비', system: '시스템', project_program: '사업', policy_law: '정책·법', event: '사건', document: '문서',
}

export default function ConceptBadge({ type }: { type: ConceptType }) {
  return <Badge tone={type === 'technology' ? 'cyan' : type === 'event' ? 'amber' : 'violet'}>{labels[type]}</Badge>
}
