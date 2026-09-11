import ApiKeySettings from './ApiKeySettings'
import DataTransferSettings from './DataTransferSettings'

export default function SettingsPage({ onBack }: { onBack: () => void }) {
  return <section className="content-view settings-page"><button className="back-link" onClick={onBack}>← 지식 홈</button><div className="page-heading"><span className="eyebrow">WORKSPACE SETTINGS</span><h1>Keep it yours.</h1><p>개인 데이터와 AI 연결 상태를 관리합니다.</p></div><div className="settings-grid"><ApiKeySettings /><DataTransferSettings /></div></section>
}
