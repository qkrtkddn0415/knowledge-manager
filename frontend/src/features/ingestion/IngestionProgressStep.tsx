import { Progress } from '../../components/ui'

export default function IngestionProgressStep({ progress, label }: { progress: number; label: string }) {
  return <div className="ingestion-progress"><span className="analysis-orbit">✦</span><h3>자료를 지식으로 바꾸는 중</h3><p>원문에서 개념과 연결 관계를 찾고 있습니다.</p><Progress value={progress} label={label} /></div>
}
