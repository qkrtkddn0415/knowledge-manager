import { Card } from '../../components/ui'

export default function HomeSummary({ documents, nodes, connections }: { documents: number; nodes: number; connections: number }) {
  return <div className="home-summary"><Card><span className="eyebrow">SOURCES</span><strong>{String(documents).padStart(2, '0')}</strong><small>documents indexed</small></Card><Card><span className="eyebrow">CONCEPTS</span><strong>{String(nodes).padStart(2, '0')}</strong><small>ideas connected</small></Card><Card><span className="eyebrow">RELATIONS</span><strong>{String(connections).padStart(2, '0')}</strong><small>links discovered</small></Card></div>
}
