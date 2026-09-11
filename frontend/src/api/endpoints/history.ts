import { request } from '../client'
export const historyEndpoints = {
  list: () => request('/api/knowledge/history'),
  detail: (id: string) => request('/api/knowledge/history/' + id),
}
