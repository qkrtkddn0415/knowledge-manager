import { Button } from '../../components/ui'

type Props = {
  onReset: () => void
  onArrange: () => void
  canArrange: boolean
  focused: boolean
  detailOpen: boolean
  onToggleDetail: () => void
  onToggleChunks: () => void
  showChunks: boolean
  reducedMotion: boolean
  onReducedMotion: () => void
  clusterZoom: number
  onZoomIn: () => void
  onZoomOut: () => void
}

export default function GraphToolbar({ onReset, onArrange, canArrange, focused, detailOpen, onToggleDetail, onToggleChunks, showChunks, reducedMotion, onReducedMotion, clusterZoom, onZoomIn, onZoomOut }: Props) {
  return <div className="graph-toolbar"><Button variant={focused ? 'secondary' : 'ghost'} onClick={onArrange} disabled={!canArrange} title={canArrange ? '선택한 노드를 기준으로 홉 수별 선형 관계도를 정렬합니다.' : '먼저 그래프에서 노드를 선택하세요.'}>{focused ? '정렬 해제' : '선택 노드 정렬'}</Button><Button variant={detailOpen ? 'secondary' : 'ghost'} onClick={onToggleDetail} disabled={!canArrange} title={canArrange ? '선택한 노드의 정보를 사이드바에서 엽니다.' : '먼저 그래프에서 노드를 선택하세요.'}>{detailOpen ? '정보 닫기' : '노드 정보'}</Button><div className="graph-zoom-control" aria-label="그래프 클러스터 확대 및 축소"><Button variant="ghost" onClick={onZoomOut} aria-label="그래프 축소">−</Button><span>{Math.round(clusterZoom * 100)}%</span><Button variant="ghost" onClick={onZoomIn} aria-label="그래프 확대">＋</Button></div><Button variant="ghost" onClick={onReset}>전체 그래프</Button><Button variant="ghost" onClick={onToggleChunks}>{showChunks ? '청크 숨기기' : '청크 포함'}</Button><Button variant="ghost" onClick={onReducedMotion} aria-pressed={reducedMotion} title="관계선을 따라 흐르는 입자 애니메이션만 켜고 끕니다. 노드와 관계선은 유지됩니다.">{reducedMotion ? '모션 켜기' : '모션 끄기'}</Button><span className="graph-motion-hint">모션: 관계선 입자</span></div>
}
