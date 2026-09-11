import { useState } from 'react'
import type { AnalysisPreview, Concept, DocumentDetail, DocumentSummary } from '../../types/document'
import { api } from '../../api/client'
import { mockApi } from '../../mocks/data'

const useLiveFileApi = import.meta.env.VITE_USE_API !== 'false'

export function useIngestionJob(onComplete: (document: DocumentDetail) => void) {
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('입력 검증')
  const [preview, setPreview] = useState<AnalysisPreview | null>(null)
  const [sourceContent, setSourceContent] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = async (title: string, text: string, file: File | null = null) => {
    setLoading(true); setError(null); setProgress(15); setLabel('원문을 준비하는 중')
    try {
      if (file && useLiveFileApi) {
        const form = new FormData()
        form.append('file', file)
        if (title.trim()) form.append('title', title.trim())
        const started = await api.createIngestion(form) as { job_id: string; document_id: string }
        setJobId(started.job_id); setDocumentId(started.document_id)
        for (let attempt = 0; attempt < 600; attempt += 1) {
          await delay(500)
          const state = await api.getIngestion(started.job_id) as { status: string; progress: number; current_step: string; preview: unknown; error?: { message?: string } | null }
          setProgress(Math.max(15, Math.min(80, state.progress || 15))); setLabel(state.current_step || '분석 중')
          if (state.status === 'review_ready') { setPreview(toAnalysisPreview(state.preview)); setLoading(false); return }
          if (state.status === 'failed') throw new Error(state.error?.message || 'PDF 분석에 실패했습니다.')
        }
        throw new Error('AI 분석이 5분 내 완료되지 않았습니다. 작업 상태를 확인한 뒤 다시 시도하세요.')
      }
      await delay(300); setProgress(42); setLabel('개념을 찾는 중')
      const sourceText = text.trim() || `PDF 파일 ${file?.name || ''}의 추출 텍스트를 분석합니다.`
      setSourceContent(sourceText)
      const next = await mockApi.analyze(title || file?.name?.replace(/\.(pdf|txt|md)$/i, '') || '새 자료', sourceText)
      setProgress(78); setLabel('연결 관계를 정리하는 중')
      await delay(300); setProgress(100); setPreview(next); setLoading(false)
    } catch (reason) {
      setLoading(false); setError(reason instanceof Error ? reason.message : '자료 분석에 실패했습니다.')
    }
  }

  const confirm = async (text: string, file: File | null = null, includedConceptKeys?: string[]) => {
    if (!preview) return null
    setLoading(true); setError(null); setLabel('지식 그래프에 저장하는 중')
    try {
      if (jobId && documentId && file && useLiveFileApi) {
        await api.confirmIngestion(jobId, { title: preview.title, summary: preview.summary, included_concept_keys: includedConceptKeys ?? preview.concepts.map((concept) => concept.temp_key), excluded_relation_keys: [] })
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await delay(500)
          const state = await api.getIngestion(jobId) as { status: string; error?: { message?: string } | null }
          if (state.status === 'succeeded') {
            const document = mapDocument(await api.getDocument(documentId))
            setLoading(false); onComplete(document); return document
          }
          if (state.status === 'failed') throw new Error(state.error?.message || '자료 저장에 실패했습니다.')
        }
        throw new Error('자료 저장 시간이 초과되었습니다.')
      }
      await delay(420)
      const document = await mockApi.confirmDocument(preview, sourceContent || text, file?.name, file?.name?.split('.').pop())
      setLoading(false); onComplete(document); return document
    } catch (reason) {
      setLoading(false); setError(reason instanceof Error ? reason.message : '자료 저장에 실패했습니다.'); return null
    }
  }

  return { progress, label, preview, loading, error, analyze, confirm, reset: () => { setProgress(0); setPreview(null); setSourceContent(''); setJobId(null); setDocumentId(null); setError(null); setLoading(false) } }
}

function toAnalysisPreview(raw: unknown): AnalysisPreview {
  const value = raw as { document_id?: string; chunk_count?: number; analysis?: Record<string, unknown> } | null
  const analysis: Record<string, unknown> = value?.analysis || (value as Record<string, unknown> | null) || {}
  const concepts = Array.isArray(analysis.concepts) ? analysis.concepts : []
  const relations = Array.isArray(analysis.relations) ? analysis.relations : []
  return {
    document_id: value?.document_id || '', chunk_count: Number(value?.chunk_count || 1), title: String(analysis.title || '새 자료'), summary: String(analysis.summary || ''),
    concepts: concepts.map((item, index) => { const concept = item as Record<string, unknown>; const key = String(concept.temp_key || concept.key || `c${index}`); return { id: key, temp_key: key, concept_type: String(concept.concept_type || 'document') as Concept['concept_type'], canonical_name: String(concept.canonical_name || ''), korean_name: String(concept.korean_name || '') || null, english_name: String(concept.english_name || '') || null, acronym: String(concept.acronym || '') || null, description: String(concept.description || ''), merge_status: 'candidate', match_status: 'new', document_count: 0, chunk_count: 0, related_concept_count: 0, source_chunk_ids: Array.isArray(concept.source_chunk_ids) ? concept.source_chunk_ids.map(String) : [] } }),
    relations: relations.map((item, index) => { const relation = item as Record<string, unknown>; return { temp_key: String(relation.temp_key || relation.key || `r${index}`), source_key: String(relation.source_key || ''), target_key: String(relation.target_key || ''), relation_type: String(relation.relation_type || 'relates_to'), label: String(relation.label || 'relates to'), evidence_chunk_id: String(relation.evidence_chunk_id || ''), evidence_text: String(relation.evidence_text || relation.evidence || ''), confidence: Number(relation.confidence || 0) } }),
  }
}

function mapDocument(raw: unknown): DocumentDetail {
  const value = raw as Record<string, any>
  const summary: DocumentSummary = { id: String(value.id), title: String(value.title || ''), source_name: String(value.source_name || ''), source_format: value.source_format === 'pdf' ? 'pdf' : value.source_format === 'md' ? 'md' : 'txt', summary: value.summary || null, content_chars: Number(value.content_chars || 0), chunk_count: Number(value.chunk_count || 0), concept_count: Number(value.concept_count || 0), ingest_status: value.ingest_status || 'ready', created_at: String(value.created_at || new Date().toISOString()), updated_at: String(value.updated_at || new Date().toISOString()) }
  return { ...summary, content: String(value.content || ''), chunks: Array.isArray(value.chunks) ? value.chunks.map((chunk: any) => ({ id: String(chunk.id), document_id: String(chunk.document_id || value.id), ordinal: Number(chunk.ordinal || 0), start_char: Number(chunk.start_char || 0), end_char: Number(chunk.end_char || 0), text: String(chunk.text || ''), concept_ids: Array.isArray(chunk.concept_ids) ? chunk.concept_ids.map(String) : [] })) : [], concepts: Array.isArray(value.concepts) ? value.concepts.map((concept: any) => ({ id: String(concept.id), concept_type: concept.concept_type, canonical_name: String(concept.canonical_name || ''), korean_name: concept.korean_name || null, english_name: concept.english_name || null, acronym: concept.acronym || null, description: String(concept.description || ''), merge_status: concept.merge_status || 'confirmed', document_count: Number(concept.document_count || 1), chunk_count: Number(concept.chunk_count || 0), related_concept_count: Number(concept.related_concept_count || 0) })) : [], related_documents: Array.isArray(value.related_documents) ? value.related_documents : [], analysis: value.analysis && typeof value.analysis === 'object' ? { concepts: Array.isArray(value.analysis.concepts) ? value.analysis.concepts : [], relations: Array.isArray(value.analysis.relations) ? value.analysis.relations : [] } : undefined }
}

function delay(milliseconds: number) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)) }
