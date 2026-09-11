import { useState } from 'react'
import type { DocumentDetail } from '../../types/document'
import { Modal } from '../../components/ui'
import IngestionInputStep from './IngestionInputStep'
import IngestionProgressStep from './IngestionProgressStep'
import AnalysisReviewStep from './AnalysisReviewStep'
import IngestionCompleteStep from './IngestionCompleteStep'
import { useIngestionJob } from './useIngestionJob'

function fileTitle(file: File) {
  return file.name.replace(/\.(pdf|txt|md)$/i, '')
}

export default function AddDocumentModal({ open, onClose, onComplete, onExplore }: { open: boolean; onClose: () => void; onComplete: (document: DocumentDetail) => void; onExplore: () => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [activeFile, setActiveFile] = useState<File | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [excluded, setExcluded] = useState<string[]>([])
  const [complete, setComplete] = useState<DocumentDetail | null>(null)
  const job = useIngestionJob((document) => setComplete(document))

  const close = () => {
    if (job.loading) return
    setTitle(''); setText(''); setFiles([]); setActiveFile(null); setPendingFiles([]); setExcluded([]); setComplete(null); job.reset(); onClose()
  }
  const addNext = () => {
    if (job.loading) return
    setTitle(''); setText(''); setFiles([]); setActiveFile(null); setPendingFiles([]); setExcluded([]); setComplete(null); job.reset()
  }
  const selectFiles = (next: File[]) => {
    setFiles(next)
    if (next.length === 1 && !title.trim()) setTitle(fileTitle(next[0]))
  }
  const analyze = () => {
    const nextFile = files[0] || null
    setActiveFile(nextFile)
    setPendingFiles(files.slice(1))
    void job.analyze(nextFile ? fileTitle(nextFile) : title, text, nextFile)
  }
  const confirm = async () => {
    const includedConceptKeys = job.preview?.concepts.filter((concept) => !excluded.includes(concept.id)).map((concept) => concept.temp_key)
    const document = await job.confirm(text, activeFile, includedConceptKeys)
    if (!document) return
    onComplete(document)
    if (pendingFiles.length === 0) return
    const [next, ...rest] = pendingFiles
    setPendingFiles(rest)
    setFiles([next, ...rest])
    setActiveFile(next)
    setTitle(fileTitle(next))
    setText('')
    setExcluded([])
    setComplete(null)
    job.reset()
    await job.analyze(fileTitle(next), '', next)
  }
  const step = complete ? '완료' : job.preview ? '검토' : job.loading ? '분석' : '입력'
  return <Modal open={open} title={'자료 추가 · ' + step} onClose={close}>{complete ? <IngestionCompleteStep title={complete.title} count={complete.concepts.length} onClose={close} onAddNext={addNext} onExplore={() => { close(); onExplore() }} /> : job.preview ? <AnalysisReviewStep preview={job.preview} excluded={excluded} onToggleConcept={(id) => setExcluded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} onBack={() => job.reset()} onConfirm={() => void confirm()} /> : job.loading ? <IngestionProgressStep progress={job.progress} label={job.label} /> : <IngestionInputStep title={title} text={text} files={files} onTitle={setTitle} onText={setText} onFiles={selectFiles} onAnalyze={analyze} onClose={close} loading={job.loading} error={job.error} />}</Modal>
}
