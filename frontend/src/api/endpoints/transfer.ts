import { request } from '../client'
export const transferEndpoints = {
  exportData: () => request('/api/knowledge/export'),
  importData: (body: FormData) => request('/api/knowledge/import', { method: 'POST', body }),
}
