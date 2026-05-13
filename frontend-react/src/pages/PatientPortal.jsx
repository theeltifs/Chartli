import { useState } from 'react';
import { LogoMark } from '../components/Logo';
import Icon from '../components/Icon';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function PatientPortal({ onBack }) {
  const [displayId, setDisplayId] = useState('');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [openVisit, setOpenVisit] = useState(null);

  async function handleLookup(e) {
    e.preventDefault();
    const id = displayId.trim().toUpperCase();
    if (!id) { setError('Please enter your Patient ID.'); return; }

    setLoading(true);
    setError('');
    setData(null);

    try {
      const res = await fetch(`${BASE}/patient-access/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || `Error ${res.status}`);
      setData(json);
      setOpenVisit(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadSummary(visit) {
    const text = [
      `Visit Summary — ${visit.date}`,
      visit.chief_complaint ? `Reason for visit: ${visit.chief_complaint}` : '',
      '',
      visit.patient_summary || 'No summary available.',
    ].filter(Boolean).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `visit-summary-${visit.date}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="patient-portal">
      {/* Top nav */}
      <nav className="patient-portal-nav">
        <div className="logo-mark" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={26} />
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>Chartli</span>
          <span style={{
            marginLeft: 6, fontSize: 11.5, fontWeight: 500,
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            color: 'var(--success)', padding: '2px 8px', borderRadius: 999,
          }}>Patient Portal</span>
        </div>
        <button
          className="btn ghost sm"
          style={{ marginLeft: 'auto' }}
          onClick={onBack}
        >
          <Icon name="arrow-left" /> Back to home
        </button>
      </nav>

      <div className="patient-portal-body">
        <div className="patient-portal-inner">

          {/* Lookup form */}
          {!data && (
            <div className="card" style={{ maxWidth: 440, margin: '0 auto' }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                Welcome to your health record
              </div>
              <div className="muted mb-4" style={{ fontSize: 14 }}>
                Enter your Patient ID to view your visit history and doctor-provided summaries.
              </div>

              <form onSubmit={handleLookup} className="col gap-3">
                <div className="field">
                  <label className="label">Patient ID</label>
                  <input
                    className="input"
                    placeholder="e.g. P-2026-00001"
                    value={displayId}
                    onChange={e => setDisplayId(e.target.value)}
                    autoFocus
                    style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.03em' }}
                  />
                  <div className="field-hint">Your Patient ID is on any visit paperwork from your clinic.</div>
                </div>

                {error && (
                  <div className="msg error">
                    <Icon name="alert-circle" />
                    {error}
                  </div>
                )}

                <button type="submit" className="btn primary full" disabled={loading}>
                  {loading
                    ? <><span className="spinner" /> Looking up records…</>
                    : <><Icon name="search" /> Find my records</>}
                </button>
              </form>
            </div>
          )}

          {/* Records view */}
          {data && (
            <>
              <div className="row between mb-4" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>Hello, {data.full_name.split(' ')[0]}</div>
                  <div className="muted mt-1" style={{ fontSize: 13 }}>
                    <span className="mono">{data.display_id}</span>
                    {' · '}{data.visits.length} finalized visit{data.visits.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button className="btn sm" onClick={() => { setData(null); setDisplayId(''); }}>
                  <Icon name="log-out" /> Sign out
                </button>
              </div>

              {data.visits.length === 0 && (
                <div className="msg neutral">
                  <Icon name="file-text" />
                  No finalized visits yet. Your doctor will share summaries here after each visit.
                </div>
              )}

              {data.visits.map((visit, i) => (
                <div className="visit-summary-card" key={visit.id}>
                  <div className="vsc-head">
                    <div>
                      <div className="bold">{visit.date}</div>
                      {visit.chief_complaint && (
                        <div className="muted text-sm mt-1">{visit.chief_complaint}</div>
                      )}
                    </div>
                    <div className="row gap-2">
                      <span className="pill success"><span className="dot" />Finalized</span>
                      <button
                        className="btn sm ghost"
                        onClick={() => setOpenVisit(openVisit === i ? null : i)}
                      >
                        {openVisit === i
                          ? <><Icon name="chevron-up" /> Hide</>
                          : <><Icon name="eye" /> View summary</>}
                      </button>
                      {visit.patient_summary && (
                        <button className="btn sm" onClick={() => downloadSummary(visit)}>
                          <Icon name="download" /> PDF
                        </button>
                      )}
                    </div>
                  </div>

                  {openVisit === i && (
                    visit.patient_summary ? (
                      <div className="vsc-body">{visit.patient_summary}</div>
                    ) : (
                      <div className="vsc-empty">
                        No written summary available for this visit yet. Contact your clinic if you need more information.
                      </div>
                    )
                  )}
                </div>
              ))}

              <div className="muted text-xs mt-6" style={{ textAlign: 'center' }}>
                For urgent health concerns, please contact your clinic directly.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
