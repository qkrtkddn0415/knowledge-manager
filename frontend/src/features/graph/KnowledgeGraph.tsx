import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import type { ForceGraphMethods } from 'react-force-graph-3d'
import type { GraphData, GraphEdge, GraphNode } from '../../types/graph'
import { transformGraph } from './graphTransform'
import { createEdgeLabel, createEmptyLabel, createNodeLabel } from './graphLabels'

type Props = {
  data: GraphData
  selectedId: string | null
  focusNodeId: string | null
  highlightedIds?: string[]
  visibleTypes: string[]
  reducedMotion: boolean
  clusterZoom: number
  fitRequest: number
  arrangeRequest: number
  onNodeClick: (node: GraphNode) => void
}

export default function KnowledgeGraph({ data, selectedId, focusNodeId, highlightedIds = [], visibleTypes, reducedMotion, clusterZoom, fitRequest, arrangeRequest, onNodeClick }: Props) {
  const graph = useMemo(() => transformGraph(data, visibleTypes, focusNodeId), [data, visibleTypes, focusNodeId])
  const graphNodeCount = graph.nodes.length
  const visualSelectedId = graph.nodes.find((node) => node.id === selectedId || node.canonical_id === selectedId)?.id || selectedId
  const highlightedIdSet = useMemo(() => new Set(highlightedIds), [highlightedIds])
  const highlightedVisualIds = useMemo(() => new Set(graph.nodes.filter((node) => matchesHighlight(node, highlightedIdSet)).map((node) => node.id)), [graph.nodes, highlightedIdSet])
  const highlightedContextIds = useMemo(() => {
    const context = new Set(highlightedVisualIds)
    if (!highlightedVisualIds.size) return context
    for (const link of graph.links) {
      const source = endpointId(link.source)
      const target = endpointId(link.target)
      if (highlightedVisualIds.has(source) || highlightedVisualIds.has(target)) {
        context.add(source)
        context.add(target)
      }
    }
    return context
  }, [graph.links, highlightedVisualIds])
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const graphRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const update = () => setDimensions({ width: container.clientWidth, height: container.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const fitGraph = useCallback(() => {
    const instance = graphRef.current
    if (!instance || graphNodeCount === 0 || dimensions.width === 0 || dimensions.height === 0) return
    const positionedNodes = graph.nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
    if (!positionedNodes.length) return
    const bounds = positionedNodes.reduce((result, node) => ({
      minX: Math.min(result.minX, node.x as number), maxX: Math.max(result.maxX, node.x as number),
      minY: Math.min(result.minY, node.y as number), maxY: Math.max(result.maxY, node.y as number),
      minZ: Math.min(result.minZ, node.z as number), maxZ: Math.max(result.maxZ, node.z as number),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity })
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: (bounds.minZ + bounds.maxZ) / 2 }
    const verticalFov = 75 * Math.PI / 180
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (dimensions.width / dimensions.height))
    const verticalDistance = Math.max(bounds.maxY - bounds.minY, 180) / (2 * Math.tan(verticalFov / 2))
    const horizontalDistance = Math.max(bounds.maxX - bounds.minX, 180) / (2 * Math.tan(horizontalFov / 2))
    const depthDistance = Math.max(bounds.maxZ - bounds.minZ, 180) / (2 * Math.tan(verticalFov / 2))
    const distance = Math.max(460, verticalDistance, horizontalDistance, depthDistance) * 1.68 / clusterZoom
    instance.cameraPosition({ x: center.x, y: center.y, z: center.z + distance }, center, 0)
  }, [clusterZoom, dimensions.height, dimensions.width, graph.nodes, graphNodeCount])

  useEffect(() => {
    const timer = window.setTimeout(fitGraph, 120)
    return () => window.clearTimeout(timer)
  }, [fitGraph, graphNodeCount, fitRequest, arrangeRequest])

  const pinDraggedNode = useCallback((node: any) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) return
    node.fx = node.x
    node.fy = node.y
    node.fz = node.z
  }, [])
  const linkTouchesFocus = (link: any) => {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    return Boolean(focusNodeId && (source === focusNodeId || target === focusNodeId))
  }
  const linkTouchesHighlight = (link: any) => {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    return highlightedVisualIds.has(source) || highlightedVisualIds.has(target)
  }
  const linkTouchesSelected = (link: any) => {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    return Boolean(visualSelectedId && (source === visualSelectedId || target === visualSelectedId))
  }

  if (import.meta.env.VITE_ENABLE_3D === 'false') return <DemoConstellation nodes={graph.nodes as Array<GraphNode & { color: string }>} links={graph.links} highlightedIds={highlightedIds} onNodeClick={onNodeClick} />
  return <div ref={containerRef} className="graph-canvas" aria-label="3D knowledge graph"><ForceGraph3D
    ref={graphRef}
    width={dimensions.width || undefined}
    height={dimensions.height || undefined}
    graphData={graph}
    backgroundColor="#EEF4FF"
    controlType="orbit"
    enableNavigationControls={true}
    nodeRelSize={5}
    nodeResolution={16}
    nodeLabel={(node: GraphNode) => highlightedIds.length > 0 && !highlightedContextIds.has(node.id) ? '' : node.show_label === false && node.id !== visualSelectedId && !highlightedVisualIds.has(node.id) ? '' : node.node_type === 'document' ? (node.subtitle || node.label) : node.label}
    nodeThreeObject={(node: GraphNode & { color: string }) => (highlightedIds.length === 0 || highlightedContextIds.has(node.id)) && (node.show_label !== false || node.id === visualSelectedId || highlightedVisualIds.has(node.id)) ? createNodeLabel(node) : createEmptyLabel()}
    nodeThreeObjectExtend={true}
    nodeColor={(node: GraphNode & { color: string }) => node.id === visualSelectedId ? '#F2A65A' : highlightedVisualIds.has(node.id) ? '#4CC7D9' : highlightedIds.length > 0 && !highlightedContextIds.has(node.id) ? 'rgba(113,128,152,0.22)' : node.node_type === 'document' ? '#F2B17C' : node.color}
    nodeVal={(node: GraphNode) => node.id === visualSelectedId || highlightedVisualIds.has(node.id) ? (node.node_type === 'document' ? 28 : node.node_type === 'concept' ? 14 : 9) : node.node_type === 'document' ? Math.max(18, node.size * 2.2) : node.node_type === 'concept' ? Math.max(8, node.size * 1.5) : Math.max(6, node.size)}
    linkLabel={(link: GraphEdge) => link.show_label === false && !linkTouchesSelected(link) && !linkTouchesFocus(link) && !linkTouchesHighlight(link) ? '' : link.label || link.relation_type}
    linkThreeObject={(link: GraphEdge) => link.show_label !== false || linkTouchesSelected(link) || linkTouchesFocus(link) || linkTouchesHighlight(link) ? createEdgeLabel(link) : createEmptyLabel()}
    linkThreeObjectExtend={true}
    linkPositionUpdate={(object, coordinates) => {
      object.position.set(
        (coordinates.start.x + coordinates.end.x) / 2,
        (coordinates.start.y + coordinates.end.y) / 2,
        (coordinates.start.z + coordinates.end.z) / 2,
      )
    }}
    linkColor={(link: any) => linkTouchesSelected(link) ? '#F2A65A' : linkTouchesHighlight(link) ? '#4C89D8' : link.is_derived ? 'rgba(242,177,124,0.92)' : linkTouchesFocus(link) ? 'rgba(76,137,216,0.98)' : 'rgba(116,151,205,0.3)'}
    linkOpacity={0.95}
    linkWidth={(link: any) => linkTouchesSelected(link) ? Math.max(3, link.confidence * 3.5) : linkTouchesHighlight(link) ? Math.max(3, link.confidence * 3.2) : link.is_derived ? 2.4 : linkTouchesFocus(link) ? Math.max(2.2, link.confidence * 3) : Math.max(1.2, link.confidence * 2)}
    linkDirectionalParticles={reducedMotion ? 0 : 2}
    linkDirectionalParticleSpeed={0.004}
    linkDirectionalParticleWidth={2.5}
    forceEngine="d3"
    warmupTicks={0}
    cooldownTicks={1}
    cooldownTime={0}
    d3AlphaDecay={1}
    d3VelocityDecay={1}
    onNodeClick={onNodeClick}
    onNodeDrag={pinDraggedNode}
    onNodeDragEnd={pinDraggedNode}
    enableNodeDrag={true}
    showNavInfo={false}
  /><div className="graph-navigation-hint">좌클릭 회전 · 우클릭 드래그 이동 · 휠 확대/축소</div></div>
}

function endpointId(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return ''
}

function DemoConstellation({ nodes, links, highlightedIds, onNodeClick }: { nodes: Array<GraphNode & { color: string }>; links: GraphEdge[]; highlightedIds: string[]; onNodeClick: (node: GraphNode) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [positions, setPositions] = useState<Record<string, { left: number; top: number }>>(() => Object.fromEntries(nodes.map((node, index) => { const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2; const radius = 30 + (index % 3) * 9; return [node.id, { left: 50 + Math.cos(angle) * radius, top: 50 + Math.sin(angle) * radius * .68 }] })))
  const moveNode = (event: React.PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    const container = containerRef.current
    const drag = dragRef.current
    if (!container || !drag || drag.id !== node.id) return
    const bounds = container.getBoundingClientRect()
    const nextLeft = Math.max(5, Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100))
    const nextTop = Math.max(8, Math.min(88, ((event.clientY - bounds.top) / bounds.height) * 100))
    drag.moved = true
    suppressClickRef.current = true
    setPositions((current) => ({ ...current, [node.id]: { left: nextLeft, top: nextTop } }))
  }
  const endDrag = () => { dragRef.current = null }
  const highlightedSet = new Set(highlightedIds)
  return <div ref={containerRef} className={'graph-canvas constellation-demo ' + (highlightedIds.length ? 'has-highlights' : '')} aria-label="Interactive knowledge constellation"><div className="constellation-grid" /><svg className="constellation-links" aria-hidden="true">{links.map((link) => { const source = positions[link.source]; const target = positions[link.target]; const sourceNode = nodes.find((node) => node.id === link.source); const targetNode = nodes.find((node) => node.id === link.target); if (!source || !target) return null; const labelX = (source.left + target.left) / 2; const labelY = (source.top + target.top) / 2; const active = Boolean(sourceNode && targetNode && (matchesHighlight(sourceNode, highlightedSet) || matchesHighlight(targetNode, highlightedSet))); return <g key={link.source + '-' + link.target} className={active ? 'is-highlighted' : ''}><line x1={source.left + '%'} y1={source.top + '%'} x2={target.left + '%'} y2={target.top + '%'} /><text className="constellation-edge-label" x={labelX + '%'} y={labelY + '%'} textAnchor="middle">{link.label || link.relation_type}</text></g> })}</svg>{nodes.map((node) => { const position = positions[node.id]; if (!position) return null; const active = matchesHighlight(node, highlightedSet); return <button key={node.id} className={'constellation-node ' + (node.node_type === 'document' ? 'is-document' : 'is-concept') + (active ? ' is-highlighted' : '')} style={{ left: position.left + '%', top: position.top + '%', '--node-color': active ? '#64D8FF' : node.color } as CSSProperties} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); suppressClickRef.current = false; dragRef.current = { id: node.id, moved: false } }} onPointerMove={(event) => moveNode(event, node)} onPointerUp={endDrag} onClick={() => { if (!suppressClickRef.current) onNodeClick(node); suppressClickRef.current = false }} title={node.label}><span /><strong>{node.label}</strong></button>})}<div className="constellation-caption"><span className="eyebrow">DEMO CONSTELLATION</span><small>노드를 드래그해 이동하고, 클릭해 상세 정보를 확인하세요.</small></div></div>
}

function matchesHighlight(node: GraphNode, ids: Set<string>) {
  return ids.has(node.id) || ids.has(node.entity_id) || ids.has(node.canonical_id || '')
}
