import type { GraphData, GraphNode } from '../../types/graph'

export const graphColors: Record<string, string> = {
  'accent-blue': '#A7C7FF',
  'accent-cyan': '#72CFE0',
  'accent-violet': '#B7A5F6',
  'accent-teal': '#8DDFCB',
  'accent-amber': '#F2B17C',
  nodeDocument: '#F2B17C',
  nodeConcept: '#B7A5F6',
  nodeChunk: '#8DDFCB',
}

export function transformGraph(data: GraphData, visibleTypes: string[], focusNodeId: string | null = null) {
  const visible = data.nodes.filter((node) => visibleTypes.includes(node.node_type))
  const ids = new Set(visible.map((node) => node.id))
  // react-force-graph mutates link.source/target from ids into node objects.
  // Always normalize and clone links so toggling filters/chunks cannot erase them.
  const normalizedEdges = data.edges.map(normalizeEdge)
  const links = normalizedEdges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  // Keep the source-to-concept reading stable in both modes. When chunks are
  // visible, the detailed document→chunk→concept path is added alongside the
  // same evidence-backed collapsed connector; hiding chunks only removes the
  // intermediate nodes, not the underlying source relationship.
  addCollapsedChunkLinks(links, data, ids, normalizedEdges)
  const satellites = createSourceSatellites(visible, links, data.nodes)
  const visualFocusNodeId = resolveVisualNodeId(satellites.nodes, focusNodeId)
  const focusNodeIds = getFocusNodeIds(satellites.nodes, satellites.links, visualFocusNodeId)
  return {
    nodes: arrangeNodes(satellites.nodes, satellites.links, visualFocusNodeId).map((node) => ({ ...node, color: graphColors[node.color_token] || graphColors['accent-cyan'] })),
    links: satellites.links,
    focusNodeIds,
  }
}

function createSourceSatellites(nodes: GraphNode[], links: GraphData['edges'], allNodes: GraphNode[] = nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const documents = nodes.filter((node) => node.node_type === 'document')
  const documentIds = new Set(documents.map((node) => node.id))
  const documentByEntityId = new Map(documents.map((node) => [node.entity_id, node.id]))
  const chunkOwners = new Map<string, string>()
  const owners = new Map<string, Set<string>>()
  const addOwner = (nodeId: string, documentId: string) => {
    if (!documentIds.has(documentId)) return
    const current = owners.get(nodeId) || new Set<string>()
    current.add(documentId)
    owners.set(nodeId, current)
  }

  for (const node of allNodes) {
    if (node.node_type !== 'chunk' || !node.document_id) continue
    const documentId = documentByEntityId.get(node.document_id)
    if (documentId) {
      chunkOwners.set(node.id, documentId)
      addOwner(node.id, documentId)
    }
  }
  for (const link of links) {
    const source = nodeById.get(link.source)
    const target = nodeById.get(link.target)
    if (!source || !target) continue
    if (source.node_type === 'document' && (target.node_type === 'chunk' || target.node_type === 'concept')) addOwner(target.id, source.id)
    if (target.node_type === 'document' && (source.node_type === 'chunk' || source.node_type === 'concept')) addOwner(source.id, target.id)
  }
  for (const link of links) {
    const source = nodeById.get(link.source)
    const target = nodeById.get(link.target)
    if (source?.node_type === 'chunk' && target?.node_type === 'concept') for (const owner of owners.get(source.id) || []) addOwner(target.id, owner)
    if (target?.node_type === 'chunk' && source?.node_type === 'concept') for (const owner of owners.get(target.id) || []) addOwner(source.id, owner)
  }

  const conceptVisualIds = new Map<string, Map<string, string>>()
  const visualNodes: GraphNode[] = []
  for (const node of nodes) {
    if (node.node_type !== 'concept') {
      visualNodes.push(node)
      continue
    }
    const sourceIds = [...(owners.get(node.id) || [])]
    if (!sourceIds.length) {
      visualNodes.push(node)
      continue
    }
    const perSource = new Map<string, string>()
    for (const sourceId of sourceIds) {
      const visualId = `${node.id}::satellite::${sourceId}`
      perSource.set(sourceId, visualId)
      visualNodes.push({ ...node, id: visualId, canonical_id: node.id, satellite_source_id: sourceId })
    }
    conceptVisualIds.set(node.id, perSource)
  }

  const visualLinks: GraphData['edges'] = []
  const seenLinks = new Set<string>()
  const addVisualLink = (link: GraphData['edges'][number], source: string, target: string) => {
    if (source === target) return
    const key = `${link.id}|${source}|${target}`
    if (seenLinks.has(key)) return
    seenLinks.add(key)
    visualLinks.push({ ...link, id: key, source, target })
  }
  const visualConcept = (conceptId: string, sourceId?: string) => {
    const perSource = conceptVisualIds.get(conceptId)
    if (!perSource) return conceptId
    if (sourceId && perSource.has(sourceId)) return perSource.get(sourceId) as string
    return perSource.values().next().value as string
  }

  for (const link of links) {
    const sourceNode = nodeById.get(link.source)
    const targetNode = nodeById.get(link.target)
    if (!sourceNode || !targetNode) continue
    const sourceIsConcept = sourceNode.node_type === 'concept'
    const targetIsConcept = targetNode.node_type === 'concept'
    if (!sourceIsConcept && !targetIsConcept) {
      addVisualLink(link, link.source, link.target)
      continue
    }
    if (sourceIsConcept && targetIsConcept) {
      const evidenceChunk = allNodes.find((node) => node.node_type === 'chunk' && node.entity_id === link.evidence_chunk_id)
      const evidenceSource = evidenceChunk ? chunkOwners.get(evidenceChunk.id) : undefined
      if (evidenceSource) {
        addVisualLink(link, visualConcept(sourceNode.id, evidenceSource), visualConcept(targetNode.id, evidenceSource))
      } else {
        const sourceOwners = [...(owners.get(sourceNode.id) || [])]
        const targetOwners = [...(owners.get(targetNode.id) || [])]
        for (const sourceOwner of sourceOwners) for (const targetOwner of targetOwners) addVisualLink(link, visualConcept(sourceNode.id, sourceOwner), visualConcept(targetNode.id, targetOwner))
      }
      continue
    }
    const conceptNode = sourceIsConcept ? sourceNode : targetNode
    const otherNode = sourceIsConcept ? targetNode : sourceNode
    const sourceId = otherNode.node_type === 'document'
      ? otherNode.id
      : otherNode.node_type === 'chunk'
        ? chunkOwners.get(otherNode.id)
        : undefined
    const conceptId = visualConcept(conceptNode.id, sourceId)
    addVisualLink(link, sourceIsConcept ? conceptId : otherNode.id, sourceIsConcept ? otherNode.id : conceptId)
  }

  // A canonical concept can be supported by several sources. The satellite
  // projection intentionally creates one visual copy per source, so add the
  // missing identity bridges back explicitly. Also aggregate those bridges at
  // the source level; otherwise source hubs would look like unrelated islands.
  const sharedSourceConcepts = new Map<string, string[]>()
  for (const [conceptId, perSource] of conceptVisualIds) {
    const sourceIds = [...perSource.keys()].sort()
    if (sourceIds.length < 2) continue
    const concept = nodeById.get(conceptId)
    const conceptLabel = concept?.label || concept?.subtitle || '공유 개념'
    for (let left = 0; left < sourceIds.length; left += 1) {
      for (let right = left + 1; right < sourceIds.length; right += 1) {
        const sourceA = sourceIds[left]
        const sourceB = sourceIds[right]
        const pairKey = [sourceA, sourceB].sort().join('|')
        sharedSourceConcepts.set(pairKey, [...(sharedSourceConcepts.get(pairKey) || []), conceptLabel])
        const satelliteA = perSource.get(sourceA)
        const satelliteB = perSource.get(sourceB)
        if (!satelliteA || !satelliteB) continue
        addVisualLink({
          id: `derived-shared-concept-${conceptId}-${sourceA}-${sourceB}`,
          source: satelliteA,
          target: satelliteB,
          relation_type: 'shared_concept',
          label: '공통 개념',
          evidence_chunk_id: '',
          evidence_text: `공유 개념: ${conceptLabel}`,
          confidence: 1,
          is_derived: true,
        }, satelliteA, satelliteB)
      }
    }
  }
  for (const [pairKey, conceptLabels] of sharedSourceConcepts) {
    const [sourceA, sourceB] = pairKey.split('|')
    const uniqueLabels = [...new Set(conceptLabels)]
    addVisualLink({
      id: `derived-shared-source-${pairKey}`,
      source: sourceA,
      target: sourceB,
      relation_type: 'shared_source_concepts',
      label: `공통 개념 ${uniqueLabels.length}개`,
      evidence_chunk_id: '',
      evidence_text: uniqueLabels.join(', '),
      confidence: 1,
      is_derived: true,
    }, sourceA, sourceB)
  }
  const dense = visualNodes.filter((node) => node.node_type === 'concept').length > 90
  const degree = new Map<string, number>()
  for (const link of visualLinks) {
    degree.set(link.source, (degree.get(link.source) || 0) + 1)
    degree.set(link.target, (degree.get(link.target) || 0) + 1)
  }
  const labelIds = new Set<string>()
  const conceptGroups = new Map<string, GraphNode[]>()
  for (const node of visualNodes.filter((item) => item.node_type === 'concept')) {
    const key = node.satellite_source_id || 'unassigned'
    conceptGroups.set(key, [...(conceptGroups.get(key) || []), node])
  }
  for (const group of conceptGroups.values()) {
    const limit = dense ? 12 : group.length
    for (const node of [...group].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0)).slice(0, limit)) labelIds.add(node.id)
  }
  return {
    nodes: visualNodes.map((node) => ({ ...node, show_label: node.node_type === 'document' || (node.node_type === 'concept' && labelIds.has(node.id)) })),
    links: visualLinks.map((link) => ({
      ...link,
      // Keep source-level bridges readable even when ordinary edge labels are
      // suppressed by dense mode. Satellite bridge labels remain available
      // after selecting either endpoint.
      show_label: link.is_derived && link.relation_type === 'shared_source_concepts' ? true : !dense,
    })),
  }
}

function resolveVisualNodeId(nodes: GraphNode[], requestedId: string | null) {
  if (!requestedId) return null
  if (nodes.some((node) => node.id === requestedId)) return requestedId
  return nodes.find((node) => node.canonical_id === requestedId)?.id || requestedId
}

function addCollapsedChunkLinks(links: GraphData['edges'], data: GraphData, visibleIds: Set<string>, edges: GraphData['edges']) {
  const chunks = new Set(data.nodes.filter((node) => node.node_type === 'chunk').map((node) => node.id))
  const documents = new Set(data.nodes.filter((node) => node.node_type === 'document').map((node) => node.id))
  const concepts = new Set(data.nodes.filter((node) => node.node_type === 'concept').map((node) => node.id))
  const existing = new Set(links.map((link) => [link.source, link.target].sort().join('|')))
  for (const chunkId of chunks) {
    const documentEdges = edges.filter((edge) => (edge.source === chunkId && documents.has(edge.target)) || (edge.target === chunkId && documents.has(edge.source)))
    const conceptEdges = edges.filter((edge) => (edge.source === chunkId && concepts.has(edge.target)) || (edge.target === chunkId && concepts.has(edge.source)))
    for (const documentEdge of documentEdges) for (const conceptEdge of conceptEdges) {
      const documentId = documentEdge.source === chunkId ? documentEdge.target : documentEdge.source
      const conceptId = conceptEdge.source === chunkId ? conceptEdge.target : conceptEdge.source
      if (!visibleIds.has(documentId) || !visibleIds.has(conceptId) || existing.has([documentId, conceptId].sort().join('|'))) continue
      links.push({ id: `collapsed-${chunkId}-${conceptId}`, source: documentId, target: conceptId, relation_type: 'mentions_via_chunk', label: 'mentions via chunk', evidence_chunk_id: chunkId, evidence_text: conceptEdge.evidence_text, confidence: Math.min(documentEdge.confidence, conceptEdge.confidence) })
      existing.add([documentId, conceptId].sort().join('|'))
    }
  }
}

function normalizeEdge(edge: GraphData['edges'][number]) {
  const value = edge as GraphData['edges'][number] & { source: unknown; target: unknown }
  return {
    ...edge,
    source: endpointId(value.source),
    target: endpointId(value.target),
  }
}

function endpointId(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return ''
}

function getFocusNodeIds(nodes: GraphNode[], links: GraphData['edges'], focusNodeId: string | null) {
  if (!focusNodeId || !nodes.some((node) => node.id === focusNodeId)) return []
  const adjacency = createAdjacency(links)
  const ids = new Set([focusNodeId])
  const queue = [focusNodeId]
  while (queue.length) {
    const current = queue.shift() as string
    for (const next of adjacency.get(current) || []) {
      if (ids.has(next)) continue
      ids.add(next)
      queue.push(next)
    }
  }
  return [...ids]
}

function arrangeNodes(nodes: GraphNode[], links: GraphData['edges'], focusNodeId: string | null) {
  if (!focusNodeId || !nodes.some((node) => node.id === focusNodeId)) return arrangeClusteredNodes(nodes, links)
  const adjacency = createAdjacency(links)
  const distances = new Map<string, number>([[focusNodeId, 0]])
  const queue = [focusNodeId]
  while (queue.length) {
    const current = queue.shift() as string
    for (const next of adjacency.get(current) || []) {
      if (distances.has(next)) continue
      distances.set(next, (distances.get(current) as number) + 1)
      queue.push(next)
    }
  }
  const maxHop = Math.max(0, ...distances.values())
  const levels = new Map<number, GraphNode[]>()
  nodes.forEach((node) => {
    const hop = distances.get(node.id) ?? maxHop + 1
    const level = levels.get(hop) || []
    level.push(node)
    levels.set(hop, level)
  })
  return nodes.map((node) => {
    const hop = distances.get(node.id) ?? maxHop + 1
    const level = levels.get(hop) || [node]
    const index = level.findIndex((candidate) => candidate.id === node.id)
    if (hop === 0) return fixed(node, 0, 0, 0)
    const rows = 6
    const band = Math.floor(index / rows)
    const row = index % rows
    const rowCount = Math.min(rows, level.length - band * rows)
    return fixed(node, hop * 300 + band * 155, (row - (rowCount - 1) / 2) * 145, band % 2 ? 60 : -60)
  })
}

function createAdjacency(links: GraphData['edges']) {
  const adjacency = new Map<string, Set<string>>()
  for (const link of links) {
    if (!adjacency.has(link.source)) adjacency.set(link.source, new Set())
    if (!adjacency.has(link.target)) adjacency.set(link.target, new Set())
    adjacency.get(link.source)?.add(link.target)
    adjacency.get(link.target)?.add(link.source)
  }
  return adjacency
}

/**
 * Default view: each source is a separated knowledge hub. Concepts supported
 * by one source orbit that source; concepts supported by multiple sources sit
 * between their source hubs and make cross-source relationships readable.
 */
function arrangeClusteredNodes(nodes: GraphNode[], links: GraphData['edges']) {
  const documents = nodes.filter((node) => node.node_type === 'document')
  if (!documents.length) return arrangeDefaultNodes(nodes)

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const documentIds = new Set(documents.map((node) => node.id))
  const documentByEntityId = new Map(documents.map((node) => [node.entity_id, node.id]))
  const centers = new Map<string, { x: number; y: number; z: number }>()
  // Use a compact grid of source islands. A large radial arrangement makes
  // the whole graph look like a snowflake instead of source-centered orbits.
  const columns = Math.max(1, Math.ceil(Math.sqrt(documents.length)))
  const rows = Math.max(1, Math.ceil(documents.length / columns))
  const horizontalGap = 1080
  const depthGap = 860

  documents.forEach((document, index) => {
    if (documents.length === 1) {
      centers.set(document.id, { x: 0, y: 0, z: 0 })
      return
    }
    const column = index % columns
    const row = Math.floor(index / columns)
    centers.set(document.id, {
      x: (column - (columns - 1) / 2) * horizontalGap,
      y: 0,
      z: (row - (rows - 1) / 2) * depthGap,
    })
  })

  const owners = new Map<string, Set<string>>()
  const addOwner = (nodeId: string, documentId: string) => {
    if (!documentIds.has(documentId)) return
    const current = owners.get(nodeId) || new Set<string>()
    current.add(documentId)
    owners.set(nodeId, current)
  }

  // API chunk nodes already carry their source document ID.
  for (const node of nodes) {
    if (node.node_type === 'chunk' && node.document_id) {
      const documentId = documentByEntityId.get(node.document_id)
      if (documentId) addOwner(node.id, documentId)
    }
  }

  // Infer ownership only through document/chunk evidence edges. Do not walk
  // concept-to-concept edges, otherwise every shared concept would collapse
  // the entire graph into one giant cluster.
  for (const link of links) {
    const source = nodeById.get(link.source)
    const target = nodeById.get(link.target)
    if (!source || !target) continue
    if (source.node_type === 'document') {
      if (target.node_type === 'chunk' || target.node_type === 'concept') addOwner(target.id, source.id)
    } else if (target.node_type === 'document') {
      if (source.node_type === 'chunk' || source.node_type === 'concept') addOwner(source.id, target.id)
    }
  }
  for (const link of links) {
    const source = nodeById.get(link.source)
    const target = nodeById.get(link.target)
    if (!source || !target) continue
    if (source.node_type === 'chunk' && target.node_type === 'concept') {
      for (const owner of owners.get(source.id) || []) addOwner(target.id, owner)
    } else if (target.node_type === 'chunk' && source.node_type === 'concept') {
      for (const owner of owners.get(target.id) || []) addOwner(source.id, owner)
    }
  }

  const concepts = nodes.filter((node) => node.node_type === 'concept')
  const buckets = new Map<string, GraphNode[]>()
  for (const concept of concepts) {
    const sourceIds = [...(owners.get(concept.id) || [])].sort()
    const bucketKey = sourceIds.length ? sourceIds.join('|') : 'unassigned'
    buckets.set(bucketKey, [...(buckets.get(bucketKey) || []), concept])
  }

  const positioned = new Map<string, GraphNode>()
  for (const document of documents) positioned.set(document.id, fixed(document, ...(toTuple(centers.get(document.id) as { x: number; y: number; z: number }))))

  for (const node of nodes.filter((item) => item.node_type === 'chunk')) {
    const sourceIds = [...(owners.get(node.id) || [])]
    const center = centers.get(sourceIds[0])
    if (!center) continue
    const index = sourceIds.length ? sourceIds.indexOf(sourceIds[0]) : 0
    positioned.set(node.id, fixed(node, center.x + 120, center.y + (index % 2 ? 55 : -55), center.z + 80))
  }

  for (const [bucketKey, bucket] of buckets) {
    const sourceIds = bucketKey === 'unassigned' ? [] : bucketKey.split('|')
    const base = sourceIds.length
      ? averageCenters(sourceIds, centers)
      : { x: 0, y: 180, z: 0 }
    bucket.forEach((node, index) => {
      // Fibonacci-sphere distribution avoids a flat stack and gives every
      // source a readable 3D satellite shell around its document node.
      const count = bucket.length
      const shell = Math.floor(index / 36)
      const shellIndex = index % 36
      const shellCount = Math.min(36, count - shell * 36)
      const latitude = Math.acos(1 - 2 * ((shellIndex + 0.5) / Math.max(shellCount, 1)))
      const longitude = shellIndex * Math.PI * (3 - Math.sqrt(5))
      const radius = (sourceIds.length > 1 ? 245 : 210) + shell * 90
      positioned.set(node.id, fixed(
        node,
        base.x + Math.sin(latitude) * Math.cos(longitude) * radius,
        base.y + Math.cos(latitude) * radius,
        base.z + Math.sin(latitude) * Math.sin(longitude) * radius,
      ))
    })
  }

  return nodes.map((node, index) => positioned.get(node.id) || fixed(node, 0, (index % 5) * 70, 0))
}

function averageCenters(ids: string[], centers: Map<string, { x: number; y: number; z: number }>) {
  const values = ids.map((id) => centers.get(id)).filter(Boolean) as Array<{ x: number; y: number; z: number }>
  if (!values.length) return { x: 0, y: 0, z: 0 }
  return values.reduce((result, value) => ({ x: result.x + value.x / values.length, y: result.y + value.y / values.length, z: result.z + value.z / values.length }), { x: 0, y: 0, z: 0 })
}

function toTuple(value: { x: number; y: number; z: number }): [number, number, number] {
  return [value.x, value.y, value.z]
}

function arrangeDefaultNodes(nodes: GraphNode[]) {
  return nodes.map((node, index) => {
    const phi = Math.acos(1 - 2 * ((index + 0.5) / Math.max(nodes.length, 1)))
    const theta = Math.PI * (1 + Math.sqrt(5)) * index
    const radius = 300
    return fixed(node, Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(theta) * radius)
  })
}

function fixed(node: GraphNode, x: number, y: number, z: number) {
  return { ...node, x, y, z, fx: x, fy: y, fz: z }
}

export function isConceptNode(node: GraphNode) {
  return node.node_type === 'concept'
}
