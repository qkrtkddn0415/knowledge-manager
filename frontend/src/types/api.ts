export type ApiError = {
  code: string
  message: string
  retryable: boolean
  details?: Array<{ field?: string; reason?: string }>
}

export type ApiEnvelope<T> = {
  data: T | null
  meta: Record<string, unknown> | null
  error: ApiError | null
  request_id: string
}

export type PaginationMeta = {
  page: number
  page_size: number
  total: number
  total_pages: number
  has_next: boolean
  has_previous: boolean
}
