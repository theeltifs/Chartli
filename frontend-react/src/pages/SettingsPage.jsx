import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

export default function SettingsPage({ theme, onToggleTheme }) {
  const isDark = theme === 'aurora';

  return (
    <>
      <Topbar crumbs={['Settings']} />
      <div className="page" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <div className="page-title">Settings</div>
        </div>

        {/* Appearance */}
        <div className="card mb-4">
          <div className="bold mb-4">Appearance</div>

          <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Theme</div>
              <div className="muted text-sm mt-1">
                {isDark ? 'Aurora — dark, dense, focused' : 'Clinic — light, comfortable, professional'}
              </div>
            </div>
            <button className="btn sm" onClick={onToggleTheme}>
              <Icon name={isDark ? 'sun' : 'moon'} />
              {isDark ? 'Switch to Clinic' : 'Switch to Aurora'}
            </button>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 16 }}>
            {/* Clinic preview */}
            <div
              onClick={!isDark ? undefined : onToggleTheme}
              style={{
                flex: 1, border: `2px solid ${!isDark ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10, overflow: 'hidden', cursor: isDark ? 'pointer' : 'default',
                transition: 'border-color .2s',
              }}
            >
              <div style={{ background: '#f7f8fa', padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ width: 40, height: 6, borderRadius: 3, background: '#0a6cf1' }} />
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: '#e4e7ec' }} />
                </div>
                <div style={{ width: '100%', height: 30, borderRadius: 6, background: '#fff', border: '1px solid #e4e7ec' }} />
              </div>
              <div style={{ background: '#fff', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#475467' }}>
                {!isDark && <Icon name="check-circle-2" size={12} style={{ marginRight: 4, color: '#0a6cf1', verticalAlign: 'middle' }} />}
                Clinic · light
              </div>
            </div>

            {/* Aurora preview */}
            <div
              onClick={isDark ? undefined : onToggleTheme}
              style={{
                flex: 1, border: `2px solid ${isDark ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10, overflow: 'hidden', cursor: !isDark ? 'pointer' : 'default',
                transition: 'border-color .2s',
              }}
            >
              <div style={{ background: '#0b0d12', padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ width: 40, height: 6, borderRadius: 3, background: '#5b8dff' }} />
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: '#232838' }} />
                </div>
                <div style={{ width: '100%', height: 30, borderRadius: 6, background: '#11141b', border: '1px solid #232838' }} />
              </div>
              <div style={{ background: '#11141b', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#a5adbe' }}>
                {isDark && <Icon name="check-circle-2" size={12} style={{ marginRight: 4, color: '#5b8dff', verticalAlign: 'middle' }} />}
                Aurora · dark
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <div className="bold mb-3">About</div>
          <div className="col gap-2 text-sm muted">
            <div className="row gap-3"><span style={{ minWidth: 120 }}>Product</span><span>Chartli — AI Medical Scribe</span></div>
            <div className="row gap-3"><span style={{ minWidth: 120 }}>Version</span><span>1.0.0 (MVP)</span></div>
            <div className="row gap-3"><span style={{ minWidth: 120 }}>Backend</span><span>FastAPI + SQLite</span></div>
            <div className="row gap-3"><span style={{ minWidth: 120 }}>Frontend</span><span>React 18 + Vite</span></div>
          </div>
          <div className="msg neutral mt-4" style={{ fontSize: 12.5 }}>
            <Icon name="info" />
            MVP — do not enter real patient data. This system is not HIPAA-compliant.
          </div>
        </div>
      </div>
    </>
  );
}
