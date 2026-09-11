import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import type { ApiError } from '../../types/api'

export function Button({ variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={'ui-button ui-button-' + variant} {...props} />
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'cyan' | 'violet' | 'green' | 'amber' | 'danger' }) {
  return <span className={'ui-badge ui-badge-' + tone}>{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={'ui-card ' + className}>{children}</section>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ui-input" {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="ui-textarea" {...props} />
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header"><div><span className="eyebrow">KNOWLEDGE INTAKE</span><h2 id="modal-title">{title}</h2></div><Button className="modal-close" variant="ghost" onClick={onClose} aria-label="모달 닫기">×</Button></div>
        {children}
      </section>
    </div>
  )
}

export function Drawer({ open, title, children, onClose }: { open: boolean; title?: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null
  return <div className="detail-drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="detail-drawer" aria-label={title || '상세 패널'} onMouseDown={(event) => event.stopPropagation()}><div className="drawer-header">{title && <h2>{title}</h2>}<Button className="drawer-close" variant="ghost" onClick={onClose} aria-label="상세 패널 닫기">×</Button></div>{children}</aside></div>
}

export function Progress({ value, label }: { value: number; label: string }) {
  return <div className="progress-wrap"><div className="progress-meta"><span>{label}</span><span>{value}%</span></div><div className="progress-track"><div className="progress-value" style={{ width: value + '%' }} /></div></div>
}

export function EmptyState({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-orbit">✦</span>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2><p>{description}</p>{action}</div>
}

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="loading-orb" />{label}</div>
}

export function ErrorState({ error, onRetry }: { error?: ApiError | Error | null; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><span className="error-icon">!</span><div><strong>잠시 문제가 발생했습니다</strong><p>{error?.message || '데이터를 불러오지 못했습니다.'}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>다시 시도</Button>}</div></div>
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return <div className="pagination"><Button variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</Button><span>{page} / {totalPages}</span><Button variant="ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>다음</Button></div>
}
