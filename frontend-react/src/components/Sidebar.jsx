import Icon from './Icon';
import { LogoMark } from './Logo';

export default function Sidebar({ page, patient, goto, onSignOut, theme, onToggleTheme }) {
  const isDark = theme === 'aurora';

  return (
    <aside className="sidebar">
      {/* Brand / Logo */}
      <div className="brand">
        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LogoMark size={32} />
        </div>
        <div>
          <div className="brand-name">Chartli</div>
          <div className="brand-sub">AI Medical Scribe</div>
        </div>
      </div>

      {/* Primary nav — only working pages */}
      <button className={`nav-item ${page === 'today' ? 'active' : ''}`} onClick={() => goto('today')}>
        <Icon name="calendar-days" /> Today
      </button>
      <button className={`nav-item ${page === 'search' ? 'active' : ''}`} onClick={() => goto('search')}>
        <Icon name="users" /> Patients
      </button>
      <button className={`nav-item ${page === 'visits' ? 'active' : ''}`} onClick={() => goto('visits')}>
        <Icon name="file-text" /> Visits
      </button>

      {/* Current patient context */}
      {patient && (
        <div className="patient-ctx" style={{ margin: '10px 0' }}>
          <div className="ctx-label">Current patient</div>
          <div className="ctx-name">{patient.full_name}</div>
          <div className="ctx-id mono">{patient.display_id}</div>
        </div>
      )}

      {/* Bottom section */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => goto('settings')}>
          <Icon name="settings" /> Settings
        </button>

        {/* Theme toggle */}
        <button className="theme-toggle" onClick={onToggleTheme}>
          <Icon name={isDark ? 'sun' : 'moon'} />
          {isDark ? 'Clinic (light)' : 'Aurora (dark)'}
        </button>

        {/* Sign out */}
        <div className="user-card" onClick={onSignOut} title="Sign out">
          <div className="avatar">DR</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Clinic Staff</div>
            <div className="muted text-xs">Click to sign out</div>
          </div>
          <Icon name="log-out" size={14} style={{ color: 'var(--fg-3)' }} />
        </div>
      </div>
    </aside>
  );
}
