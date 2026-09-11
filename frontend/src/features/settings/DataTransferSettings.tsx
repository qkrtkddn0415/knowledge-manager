import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { Button, Card } from '../../components/ui'

const liveApi = import.meta.env.VITE_USE_API !== 'false'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function DataTransferSettings() {
  const backupInput = useRef<HTMLInputElement>(null)
  const graphInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const downloadFile = async (graph: boolean) => {
    setBusy(true); setMessage(''); setError('')
    try {
      if (!liveApi) throw new Error('Mock 모드에서는 파일 전송을 사용할 수 없습니다.')
      const blob = graph ? await api.downloadGraphExport() : await api.downloadDataExport()
      triggerDownload(blob, graph ? 'second-brain-graph.json' : 'second-brain-backup.json')
      setMessage(graph ? '지식그래프 JSON을 저장했습니다.' : '전체 백업 파일을 저장했습니다.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '파일 저장에 실패했습니다.') } finally { setBusy(false) }
  }

  const importFile = async (file: File, graph: boolean) => {
    setBusy(true); setMessage(''); setError('')
    try {
      if (!liveApi) throw new Error('Mock 모드에서는 파일 전송을 사용할 수 없습니다.')
      const form = new FormData(); form.append('file', file)
      const result = graph ? await api.importGraph(form) : await api.importData(form)
      const data = result as { imported_nodes?: number; imported_edges?: number; imported_count?: number; skipped_count?: number }
      setMessage(graph ? `그래프를 가져왔습니다. 노드 ${data.imported_nodes ?? 0}개, 엣지 ${data.imported_edges ?? 0}개` : `백업을 가져왔습니다. 문서 ${data.imported_count ?? 0}개 추가, ${data.skipped_count ?? 0}개 건너뜀`)
      window.setTimeout(() => window.location.reload(), 700)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '파일 가져오기에 실패했습니다.') } finally { setBusy(false) }
  }

  return <Card><div className="card-heading"><span>DATA PORTABILITY</span><span>LOCAL WORKSPACE</span></div><p className="setting-copy">원문 백업과 canonical 지식그래프 JSON을 각각 저장하거나 복원할 수 있습니다. 그래프 JSON은 Neo4j 등 property-graph 도구로 변환하기 쉬운 형식입니다.</p><div className="setting-actions"><Button variant="secondary" onClick={() => void downloadFile(false)} disabled={busy}>백업 내보내기</Button><Button variant="secondary" onClick={() => void downloadFile(true)} disabled={busy}>그래프 JSON 내보내기</Button><Button variant="ghost" onClick={() => backupInput.current?.click()} disabled={busy}>백업 가져오기</Button><Button variant="ghost" onClick={() => graphInput.current?.click()} disabled={busy}>그래프 JSON 가져오기</Button></div>{message && <p className="success-copy">{message}</p>}{error && <p className="transfer-error">{error}</p>}<input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file, false) }} /><input ref={graphInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file, true) }} /></Card>
}
