import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial } from 'three'
import type { Object3D } from 'three'
import type { GraphEdge, GraphNode } from '../../types/graph'

const FONT = '700 64px Inter, "Noto Sans KR", sans-serif'
const DOCUMENT_FONT = '800 72px Inter, "Noto Sans KR", sans-serif'
const EDGE_FONT = '700 56px Inter, "Noto Sans KR", sans-serif'
const MAX_NODE_LABEL_LENGTH = 32
const MAX_EDGE_LABEL_LENGTH = 24

export function createNodeLabel(node: GraphNode & { color?: string }): Object3D {
  const isDocument = node.node_type === 'document'
  const text = shorten(isDocument ? (node.subtitle || node.label) : node.label, MAX_NODE_LABEL_LENGTH)
  const sprite = createLabelSprite(text, {
    font: isDocument ? DOCUMENT_FONT : FONT,
    color: '#263452',
    background: isDocument ? 'rgba(255, 239, 218, 0.96)' : 'rgba(255, 255, 255, 0.94)',
    border: isDocument ? '#F2B17C' : node.color || '#72CFE0',
    paddingX: isDocument ? 24 : 18,
    paddingY: isDocument ? 16 : 12,
    scale: isDocument ? 3.0 : 3.35,
  })
  sprite.position.y = isDocument ? 34 : 22
  return sprite
}

export function createEmptyLabel(): Object3D {
  return new Sprite()
}

export function createEdgeLabel(edge: GraphEdge): Object3D {
  const text = shorten(edge.label || edge.relation_type, MAX_EDGE_LABEL_LENGTH)
  return createLabelSprite(text, {
    font: EDGE_FONT,
    color: '#30466A',
    background: 'rgba(255, 255, 255, 0.94)',
    border: edge.confidence >= 0.8 ? '#72CFE0' : '#B9C6DF',
    paddingX: 12,
    paddingY: 8,
    scale: 3.8,
  })
}

function createLabelSprite(text: string, options: {
  font: string
  color: string
  background: string
  border: string
  paddingX: number
  paddingY: number
  scale: number
}) {
  const measureCanvas = document.createElement('canvas')
  const measureContext = measureCanvas.getContext('2d')
  if (!measureContext) return new Sprite()
  measureContext.font = options.font
  const textWidth = Math.ceil(measureContext.measureText(text).width)
  const width = Math.max(48, textWidth + options.paddingX * 2)
  const height = 28 + options.paddingY * 2
  const canvas = document.createElement('canvas')
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  const context = canvas.getContext('2d')
  if (!context) return new Sprite()
  context.scale(pixelRatio, pixelRatio)
  context.font = options.font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  roundRect(context, 0.5, 0.5, width - 1, height - 1, 8)
  context.fillStyle = options.background
  context.fill()
  context.strokeStyle = options.border
  context.lineWidth = 1.25
  context.stroke()
  context.fillStyle = options.color
  context.fillText(text, width / 2, height / 2 + 1)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  const sprite = new Sprite(material)
  sprite.scale.set(width / options.scale, height / options.scale, 1)
  sprite.renderOrder = 10
  return sprite
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

function shorten(value: string, maxLength: number) {
  const normalized = value.trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}
