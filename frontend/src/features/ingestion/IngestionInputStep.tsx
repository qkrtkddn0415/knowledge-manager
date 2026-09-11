import { useState } from 'react'
import { Button, Input, Textarea } from '../../components/ui'

type Props = {
  title: string
  text: string
  files: File[]
  onTitle: (value: string) => void
  onText: (value: string) => void
  onFiles: (value: File[]) => void
  onAnalyze: () => void
  onClose: () => void
  loading: boolean
  error?: string | null
}

export default function IngestionInputStep({ title, text, files, onTitle, onText, onFiles, onAnalyze, onClose, loading, error }: Props) {
  const [dragging, setDragging] = useState(false)
  const canAnalyze = files.length > 0 || text.trim().length >= 20
  const acceptFiles = (list: FileList | File[]) => onFiles(Array.from(list).filter((file) => /\.(pdf|txt|md)$/i.test(file.name)))
  return <div className="ingestion-step"><label>자료 제목<Input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="파일명으로 자동 제안됩니다" /></label><label>PDF 또는 텍스트 파일<span className={'file-input-row ' + (dragging ? 'is-dragging' : '')} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(event.dataTransfer.files) }}><input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => acceptFiles(event.target.files || [])} /><span className="file-names">{files.length ? files.map((file) => file.name).join(', ') : '여러 PDF, TXT, MD 파일을 한 번에 선택하거나 끌어놓으세요'}</span></span></label><label>텍스트 자료<Textarea value={text} onChange={(event) => onText(event.target.value)} placeholder="파일을 선택하거나 메모·업무자료를 붙여 넣으세요…" rows={9} /></label><p className="field-hint">선택한 파일은 파일별로 분석 결과를 확인한 뒤 순서대로 저장합니다. PDF는 텍스트 추출 PDF만 지원합니다.</p>{error && <p className="ingestion-error" role="alert">{error}</p>}<div className="step-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="primary" onClick={onAnalyze} disabled={loading || !canAnalyze}>{loading ? '분석 시작…' : files.length > 1 ? `${files.length}개 자료 분석 시작 →` : '분석 시작 →'}</Button></div></div>
}
