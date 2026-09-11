import { Button } from '../../components/ui'

export default function DocumentActions({ onOpen, onDelete }: { onOpen: () => void; onDelete?: () => void }) {
  return <div className="document-actions"><Button variant="secondary" onClick={onOpen}>문서 열기</Button>{onDelete && <Button variant="danger" onClick={onDelete}>삭제</Button>}</div>
}
