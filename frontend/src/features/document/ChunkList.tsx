import type { Chunk } from '../../types/document'
import { Badge } from '../../components/ui'

export default function ChunkList({ chunks, activeChunkId, onSelect }: { chunks: Chunk[]; activeChunkId?: string | null; onSelect?: (chunk: Chunk) => void }) {
  return <div className="chunk-list">{chunks.map((chunk) => <button className={'chunk-card ' + (chunk.id === activeChunkId ? 'is-active' : '')} key={chunk.id} aria-current={chunk.id === activeChunkId ? 'true' : undefined} onClick={() => onSelect?.(chunk)}><div><Badge tone="cyan">CHUNK {String(chunk.ordinal + 1).padStart(2, '0')}</Badge><span>{chunk.start_char.toLocaleString()}–{chunk.end_char.toLocaleString()} chars</span></div><p>{chunk.text}</p></button>)}</div>
}
