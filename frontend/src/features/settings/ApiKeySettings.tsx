import { useEffect, useState } from 'react'
import { settingsEndpoints } from '../../api/endpoints/settings'
import { Button, Card, Input } from '../../components/ui'

type SettingsPayload = {
  openai_api_key?: { configured?: boolean }
  ai_available?: boolean
}

const liveApi = import.meta.env.VITE_USE_API !== 'false'

export default function ApiKeySettings() {
  const [key, setKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(liveApi)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!liveApi) return
    void settingsEndpoints.get().then((result) => {
      const data = result as SettingsPayload
      setConfigured(Boolean(data.openai_api_key?.configured || data.ai_available))
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : '설정 상태를 불러오지 못했습니다.')
    }).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setMessage(''); setError('')
    try {
      if (!liveApi) throw new Error('Mock 모드에서는 API 키를 저장할 수 없습니다.')
      const result = await settingsEndpoints.update({ openai_api_key: key.trim() }) as SettingsPayload
      setConfigured(Boolean(result.openai_api_key?.configured || result.ai_available))
      setKey('')
      setMessage('키가 백엔드 워크스페이스에 저장되었습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'API 키 저장에 실패했습니다.')
    } finally { setSaving(false) }
  }

  return <Card>
    <div className="card-heading"><span>OPENAI CONNECTION</span><span className={configured ? 'status-dot' : 'status-dot offline'}>{loading ? 'CHECKING' : configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span></div>
    <p className="setting-copy">배포 후 이 화면에서 OpenAI API 키를 입력하면 AI 문서 분석, 의미 검색, AI 질문 답변을 활성화할 수 있습니다. 키는 프론트엔드가 아닌 백엔드에만 전달됩니다.</p>
    <div className="setting-form"><Input type="password" value={key} onChange={(event) => { setKey(event.target.value); setMessage(''); setError('') }} placeholder="sk-••••••••••••" aria-label="OpenAI API 키" /><Button variant="secondary" onClick={() => void save()} disabled={saving || !key.trim() || !liveApi}>{saving ? '저장 중…' : '키 저장'}</Button></div>
    <p className="setting-copy">환경변수 <code>OPENAI_API_KEY</code>가 있으면 환경변수가 우선 적용됩니다. 화면에서 저장한 키는 백엔드 SQLite runtime 볼륨에 보존됩니다.</p>
    {message && <p className="success-copy">{message}</p>}
    {error && <p className="transfer-error">{error}</p>}
  </Card>
}
