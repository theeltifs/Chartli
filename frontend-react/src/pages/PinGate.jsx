import { useState } from 'react';
import { setPin, api } from '../api';
import Icon from '../components/Icon';

export default function PinGate({ onSuccess, onBack }) {
  const [pin, setLocalPin] = useState('');
  const [error, setError]  = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!pin.trim()) { setError('PIN is required.'); return; }
    setLoading(true);
    setError('');
    setPin(pin);
    try {
      await api.get('/patients/search', { q: '', limit: 1 });
      onSuccess();
    } catch (err) {
      setPin('');
      setError(err.message.includes('Invalid') || err.message.includes('401')
        ? 'Incorrect PIN — please try again.'
        : `Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pin-gate">
      <div className="pin-card">
        {onBack && (
          <button className="btn ghost sm mb-4" onClick={onBack} style={{ padding: '4px 0' }}>
            <Icon name="arrow-left" /> Back
          </button>
        )}
        <div className="pin-logo">Chartli</div>
        <div className="pin-tagline">Doctor Portal — enter your clinic PIN</div>

        <div className="msg neutral mb-4" style={{ fontSize: 12.5 }}>
          <Icon name="info" />
          MVP — do not enter real patient data.
        </div>

        <form onSubmit={handleSubmit} className="col gap-3">
          <div className="field">
            <label className="label" htmlFor="pin">Clinic PIN</label>
            <input
              id="pin"
              className="input"
              type="password"
              placeholder="Enter your PIN"
              value={pin}
              onChange={e => setLocalPin(e.target.value)}
              autoFocus
            />
          </div>

          {error && (
            <div className="msg error">
              <Icon name="alert-circle" />
              {error}
            </div>
          )}

          <button className="btn primary full mt-2" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" />Verifying…</> : <>Sign in <Icon name="arrow-right" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
