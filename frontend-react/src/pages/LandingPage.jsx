import Icon from '../components/Icon';
import { LogoFull } from '../components/Logo';

export default function LandingPage({ onDoctor, onPatient, theme, onToggleTheme }) {
  return (
    <div className="landing">
      {/* Theme toggle top-right */}
      <button
        onClick={onToggleTheme}
        style={{
          position: 'fixed', top: 16, right: 16,
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: 'var(--fg-2)',
        }}
      >
        <Icon name={theme === 'aurora' ? 'sun' : 'moon'} size={14} />
        {theme === 'aurora' ? 'Light mode' : 'Dark mode'}
      </button>

      {/* Logo */}
      <div className="landing-logo">
        <LogoFull height={48} />
      </div>
      <div className="landing-tagline">Document Less, Care More</div>

      {/* Portal cards */}
      <div className="portal-cards">
        <div className="portal-card" onClick={onDoctor}>
          <div className="pc-icon"><Icon name="stethoscope" /></div>
          <div className="pc-title">Doctor Portal</div>
          <div className="pc-desc">
            Access the full clinical workspace — manage patients, record visits, generate SOAP notes and summaries.
          </div>
          <button className="pc-btn" onClick={onDoctor}>Sign in with PIN →</button>
        </div>

        <div className="portal-card" onClick={onPatient}>
          <div className="pc-icon" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}>
            <Icon name="heart-pulse" />
          </div>
          <div className="pc-title">Patient Portal</div>
          <div className="pc-desc">
            View your visit history and doctor-provided summaries in plain language.
          </div>
          <button
            className="pc-btn"
            style={{ background: 'var(--success)' }}
            onClick={onPatient}
          >
            Access my records →
          </button>
        </div>
      </div>

      <div className="muted text-xs mt-6" style={{ textAlign: 'center' }}>
        MVP — do not enter real patient data
      </div>
    </div>
  );
}
