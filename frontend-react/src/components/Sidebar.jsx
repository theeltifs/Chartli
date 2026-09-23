import Icon from './Icon';
import { LogoFull } from './Logo';

export default function Sidebar({ page, patient, goto, onSignOut, theme, onToggleTheme }) {
  const isDark = theme === 'aurora';

  return (
    <aside className="sidebar modern-sidebar">
      <div className="brand"><LogoFull height={36} inverse /></div>

      <div className="nav-section">Workspace</div>
      <button className={`nav-item ${page === 'today' ? 'active' : ''}`} onClick={() => goto('today')}>
        <Icon name="layout-dashboard" /> <span>Today</span>
      </button>
      <button className={`nav-item ${page === 'search' ? 'active' : ''}`} onClick={() => goto('search')}>
        <Icon name="users-round" /> <span>Patients</span>
      </button>
      <button className={`nav-item ${page === 'visits' ? 'active' : ''}`} onClick={() => goto('visits')}>
        <Icon name="notebook-tabs" /> <span>Visits</span>
      </button>

      {patient && (
        <div className="patient-ctx">
          <div className="ctx-label"><span className="live-dot" /> Current patient</div>
          <div className="ctx-name">{patient.full_name}</div>
          <div className="ctx-id mono">{patient.display_id}</div>
        </div>
      )}

      <div className="sidebar-bottom">
        <div className="nav-section">Preferences</div>
        <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => goto('settings')}>
          <Icon name="settings-2" /> <span>Settings</span>
        </button>
        <button className="nav-item" onClick={onToggleTheme}>
          <Icon name={isDark ? 'sun' : 'moon-star'} /> <span>{isDark ? 'Light appearance' : 'Dark appearance'}</span>
        </button>

        <div className="user-card">
          <div className="avatar">CS</div>
          <div className="user-meta"><strong>Clinic staff</strong><small>Secure session</small></div>
          <button className="signout-button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><Icon name="log-out" /></button>
        </div>
      </div>
    </aside>
  );
}