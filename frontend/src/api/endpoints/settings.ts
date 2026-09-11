import { request } from '../client'
export const settingsEndpoints = {
  get: () => request('/api/settings'),
  update: (body: unknown) => request('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
}
