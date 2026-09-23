import { useState } from 'react';
import { setPin, api } from '../api';
import Icon from '../components/Icon';
import { LogoFull } from '../components/Logo';

export default function PinGate({ onSuccess, onBack }) {
  const [pin, setLocalPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const normalizedPin = pin.trim();
    if (!normalizedPin) { setError('Enter your clinic PIN to continue.'); return; }
    setLoading(true);
    setError('');
    setPin(normalizedPin);
    try {
      await api.get('/auth/verify');
      onSuccess();
    } catch (err) {
      setPin('');
      setError(err.message.toLowerCase().includes('pin') || err.message.includes('401')
        ? 'That PIN does not match this clinic. Please try again.'
        : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pin-gate modern-auth">
      <section className="auth-story">
        <div className="auth-story-inner">
          <LogoFull height={46} inverse />
          <div className="auth-kicker"><span /> Secure clinical workspace</div>
          <h1>Less time charting.<br />More time caring.</h1>
          <p>Turn natural clinical conversations into clear, structured documentation while keeping every visit organized.</p>
          <div className="auth-benefits">
            <div><Icon name="sparkles" /><span><strong>AI-assisted notes</strong><small>Structured SOAP documentation in seconds</small></span></div>
            <div><Icon name="shield-check" /><span><strong>Clinic protected</strong><small>PIN-gated access for your workspace</small></span></div>
            <div><Icon name="history" /><span><strong>Continuity built in</strong><small>Patient context across every visit</small></span></div>
          </div>
        </div>
        <div className="auth-orb orb-one" /><div className="auth-orb orb-two" />
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          {onBack && (
            <button className="auth-back" onClick={onBack} type="button">
              <Icon name="arrow-left" /> Back to portal selection
            </button>
          )}
          <div className="auth-mobile-logo"><LogoFull height={40} /></div>
          <div className="auth-icon"><Icon name="lock-keyhole" size={24} /></div>
          <div className="auth-heading">
            <span>Doctor portal</span>
            <h2>Welcome back</h2>
            <p>Enter your clinic PIN to open the Chartli workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="label" htmlFor="pin">Clinic PIN</label>
            <div className="pin-input-wrap">
              <Icon name="key-round" className="pin-leading-icon" />
              <input
                id="pin"
                className="input pin-input"
                type={showPin ? 'text' : 'password'}
                placeholder="Enter clinic PIN"
                value={pin}
                onChange={e => setLocalPin(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              <button type="button" className="pin-visibility" onClick={() => setShowPin(v => !v)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'}>
                <Icon name={showPin ? 'eye-off' : 'eye'} />
              </button>
            </div>

            {error && <div className="msg error auth-error"><Icon name="alert-circle" />{error}</div>}

            <button className="btn primary full auth-submit" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" />Verifying access…</> : <>Open workspace <Icon name="arrow-right" /></>}
            </button>
          </form>

          <div className="auth-security"><Icon name="shield-check" /> Your PIN is used only to authenticate this session.</div>
          <div className="auth-disclaimer"><Icon name="info" /> Demo environment — do not enter real patient data.</div>
        </div>
      </section>
    </div>
  );
}