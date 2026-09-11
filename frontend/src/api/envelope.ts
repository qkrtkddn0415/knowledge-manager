import type { ApiEnvelope } from '../types/api'

export function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.error || envelope.data === null) {
    throw new Error(envelope.error?.message ?? '응답 데이터를 불러오지 못했습니다.')
  }
  return envelope.data
}
