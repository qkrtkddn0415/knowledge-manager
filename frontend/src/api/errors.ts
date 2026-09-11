export const apiErrorMessages: Record<string, string> = {
  OPENAI_NOT_CONFIGURED: '설정에서 OpenAI API 키를 등록하면 AI 기능을 사용할 수 있습니다.',
  VECTOR_STORE_NOT_CONFIGURED: 'Vector Store 설정이 필요합니다.',
  AI_PROVIDER_ERROR: 'AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',
  AI_RATE_LIMITED: 'AI 요청이 잠시 제한되었습니다. 조금 후 다시 시도하세요.',
  RESOURCE_NOT_READY: '자료 분석이 아직 끝나지 않았습니다.',
  CITATION_MAPPING_FAILED: '일부 근거를 원문에 연결하지 못했습니다.',
}

export function getUserErrorMessage(code: string | undefined, fallback: string) {
  return (code && apiErrorMessages[code]) || fallback
}
