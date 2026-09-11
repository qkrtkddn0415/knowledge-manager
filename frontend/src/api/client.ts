import type { ApiEnvelope } from '../types/api'
import type { AskRequest, AskResponse, ConversationDetail, ConversationSummary } from '../types/search'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(apiBaseUrl + path, { ...options, headers })
  const envelope = (await response.json()) as ApiEnvelope<T>
  if (!response.ok || envelope.error) throw new Error(envelope.error?.message ?? 'HTTP error')
  return envelope.data as T
}

async function download(path: string): Promise<Blob> {
  const response = await fetch(apiBaseUrl + path)
  if (!response.ok) {
    const envelope = await response.json().catch(() => null) as ApiEnvelope<unknown> | null
    throw new Error(envelope?.error?.message ?? '파일을 내려받지 못했습니다.')
  }
  return response.blob()
}

export type ApiClient = {
  getGraph: (query?: string) => Promise<unknown>
  getDocuments: (query?: string) => Promise<unknown>
  getDocument: (id: string) => Promise<unknown>
  deleteDocument: (id: string) => Promise<{ job_id?: string; status?: string }>
  getNode: (id: string) => Promise<unknown>
  getIngestion: (id: string) => Promise<unknown>
  confirmIngestion: (id: string, payload: unknown) => Promise<unknown>
  search: (query: string) => Promise<unknown>
  ask: (input: AskRequest) => Promise<AskResponse>
  getHistory: (query?: string) => Promise<unknown>
  getConversations: (query?: string) => Promise<ConversationSummary[]>
  getConversation: (id: string) => Promise<ConversationDetail>
  deleteConversation: (id: string) => Promise<unknown>
  createIngestion: (input: FormData) => Promise<unknown>
  importWebSource: (input: { url: string; title?: string; excerpt?: string }) => Promise<{ job_id: string; document_id: string; status: string; source_url: string }>
  downloadDataExport: () => Promise<Blob>
  downloadGraphExport: () => Promise<Blob>
  importData: (input: FormData) => Promise<unknown>
  importGraph: (input: FormData) => Promise<unknown>
}

export const api: ApiClient = {
  getGraph: (query = '') => request('/api/knowledge/graph' + query),
  getDocuments: (query = '') => request('/api/knowledge/documents' + query),
  getDocument: (id) => request('/api/knowledge/documents/' + id + '?include_content=true&include_chunks=true&include_concepts=true'),
  deleteDocument: (id) => request<{ job_id?: string; status?: string }>('/api/knowledge/documents/' + id, { method: 'DELETE' }),
  getNode: (id) => request('/api/knowledge/nodes/' + id),
  getIngestion: (id) => request('/api/knowledge/ingestions/' + id),
  confirmIngestion: (id, payload) => request('/api/knowledge/ingestions/' + id + '/confirm', { method: 'POST', body: JSON.stringify(payload) }),
  search: (query) => request('/api/knowledge/search?q=' + encodeURIComponent(query)),
  ask: (input) => request<AskResponse>('/api/knowledge/ask', { method: 'POST', body: JSON.stringify({ save_history: true, ...input }) }),
  getHistory: (query = '') => request('/api/knowledge/history' + query),
  getConversations: (query = '') => request<ConversationSummary[]>('/api/knowledge/chat/conversations' + query),
  getConversation: (id) => request<ConversationDetail>('/api/knowledge/chat/conversations/' + id),
  deleteConversation: (id) => request('/api/knowledge/chat/conversations/' + id, { method: 'DELETE' }),
  createIngestion: (input) => request('/api/knowledge/ingestions', { method: 'POST', body: input }),
  importWebSource: (input) => request('/api/knowledge/web-sources/import', { method: 'POST', body: JSON.stringify(input) }),
  downloadDataExport: () => download('/api/knowledge/export'),
  downloadGraphExport: () => download('/api/knowledge/graph/export'),
  importData: (input) => request('/api/knowledge/import', { method: 'POST', body: input }),
  importGraph: (input) => request('/api/knowledge/graph/import', { method: 'POST', body: input }),
}

export type { ApiEnvelope }
