export type ViewName = 'home' | 'library' | 'search' | 'ask' | 'history' | 'settings'

export function getView(): ViewName {
  const path = window.location.pathname
  if (path.startsWith('/search')) return 'search'
  if (path.startsWith('/library')) return 'library'
  if (path.startsWith('/ask')) return 'ask'
  if (path.startsWith('/history')) return 'history'
  if (path.startsWith('/settings')) return 'settings'
  return 'home'
}

export function navigate(view: ViewName, query?: string) {
  const path = view === 'home' ? '/' : '/' + view + (query ? '?' + query : '')
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
