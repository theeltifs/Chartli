import Icon from '../components/Icon';
import { LogoFull } from '../components/Logo';

export default function LandingPage({ onDoctor, onPatient, theme, onToggleTheme }) {
  return (
    <div className="landing modern-landing">
      <nav className="landing-nav">
        <LogoFull height={42} />
        <div className="landing-nav-actions">
          <span className="system-status"><i /> Systems ready</span>
          <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle color theme">
            <Icon name={theme === 'aurora' ? 'sun' : 'moon'} />
          </button>
        </div>
      </nav>

      <main className="landing-main">
        <section className="landing-copy">
          <div className="eyebrow"><Icon name="sparkles" /> Clinical documentation, reimagined</div>
          <h1>Turn every visit into <span>better care.</span></h1>
          <p className="landing-lede">Chartli transforms notes and conversations into structured clinical documentation—so care teams can stay present with patients.</p>
          <div className="landing-proof">
            <div><Icon name="file-check-2" /><span><strong>Structured SOAP notes</strong><small>Consistent, editable documentation</small></span></div>
            <div><Icon name="audio-lines" /><span><strong>Voice to chart</strong><small>Dictation and conversation capture</small></span></div>
            <div><Icon name="circle-user-round" /><span><strong>Patient continuity</strong><small>Context across every encounter</small></span></div>
          </div>
          <div className="landing-note"><Icon name="shield-alert" /> Portfolio demo. Not a regulated medical device.</div>
        </section>

        <section className="access-card">
          <div className="access-card-head">
            <span>Choose your workspace</span>
            <h2>How would you like to continue?</h2>
          </div>
          <button className="access-option primary-option" onClick={onDoctor}>
            <span className="access-icon"><Icon name="stethoscope" /></span>
            <span className="access-copy"><strong>Doctor portal</strong><small>Manage patients, visits and clinical notes</small></span>
            <span className="access-arrow"><Icon name="arrow-up-right" /></span>
          </button>
          <button className="access-option" onClick={onPatient}>
            <span className="access-icon patient"><Icon name="heart-pulse" /></span>
            <span className="access-copy"><strong>Patient portal</strong><small>View visit summaries and care instructions</small></span>
            <span className="access-arrow"><Icon name="arrow-up-right" /></span>
          </button>
          <div className="access-footer"><Icon name="lock" /> Secure access to your Chartli workspace</div>
        </section>
      </main>

      <footer className="landing-footer"><span>© 2026 Chartli</span><span>Document less. Care more.</span></footer>
    </div>
  );
}