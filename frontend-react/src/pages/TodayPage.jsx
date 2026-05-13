import { useState, useEffect } from 'react';
import { api } from '../api';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

const MODE_ICON = { typed: 'keyboard', dictation: 'mic', conversation: 'messages-square' };

function initials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function TodayPage({ goto }) {
  const [items, setItems]   = useState([]);
  const [date, setDate]     = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/notes/today')
      .then(d => { setItems(d.items); setDate(d.date); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const todayLabel = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <Topbar crumbs={['Today']} />
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-title">Today</div>
            <div className="page-sub">{todayLabel}</div>
          </div>
          <button className="btn primary" onClick={() => goto('search')}>
            <Icon name="user-plus" /> Add patient
          </button>
        </div>

        {error && <div className="msg error mb-3"><Icon name="alert-circle" />{error}</div>}

        {loading && (
          <div className="row gap-2 muted">
            <span className="spinner" /> Loading today's visits…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Icon name="calendar-days" size={40} style={{ color: 'var(--fg-muted)', marginBottom: 16 }} />
            <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>No visits today</div>
            <div className="muted" style={{ fontSize: 14 }}>
              Visits you create today will appear here.
            </div>
            <button className="btn primary mt-4" onClick={() => goto('search')}>
              <Icon name="users" /> Find a patient
            </button>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="muted text-xs bold mb-3" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {items.length} visit{items.length !== 1 ? 's' : ''} today
            </div>

            <div className="card" style={{ padding: 0 }}>
              {/* Header row */}
              <div className="row" style={{
                padding: '8px 16px', borderBottom: '1px solid var(--border)',
                fontSize: 11.5, color: 'var(--fg-3)',
                textTransform: 'uppercase', letterSpacing: '.04em', gap: 14,
              }}>
                <div style={{ flex: 2 }}>Patient</div>
                <div style={{ flex: 2 }}>Chief complaint</div>
                <div style={{ flex: 1 }}>Mode</div>
                <div style={{ flex: '.8', textAlign: 'right' }}>Status</div>
              </div>

              {items.map(item => {
                const fin = item.status === 'finalized';
                return (
                  <div
                    key={item.note_id}
                    className="card-row"
                    onClick={() => goto('patient_detail', {
                      patient: {
                        id: item.patient_id,
                        display_id: item.patient_display_id,
                        full_name: item.patient_full_name,
                        allergies: item.patient_allergies,
                      },
                    })}
                  >
                    <div className="row gap-3" style={{ flex: 2, minWidth: 0 }}>
                      <div className="avatar">{initials(item.patient_full_name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="bold truncate">{item.patient_full_name}</div>
                        <div className="mono muted text-xs">{item.patient_display_id}</div>
                      </div>
                    </div>

                    <div style={{ flex: 2, fontSize: 13, color: 'var(--fg-2)' }} className="truncate">
                      {item.chief_complaint || <em className="muted">—</em>}
                    </div>

                    <div style={{ flex: 1 }}>
                      <span className="pill">
                        <Icon name={MODE_ICON[item.input_mode] || 'file-text'} size={11} />
                        {item.input_mode}
                      </span>
                    </div>

                    <div style={{ flex: '.8', textAlign: 'right' }}>
                      <span className={`pill ${fin ? 'success' : 'warning'}`}>
                        <span className="dot" />{fin ? 'Final' : 'Draft'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
