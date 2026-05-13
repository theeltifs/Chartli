import { useState, useEffect } from 'react';
import { api } from '../api';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

const MODE_ICON = { typed: 'keyboard', dictation: 'mic', conversation: 'messages-square' };

export default function VisitsPage({ goto }) {
  const [patients, setPatients] = useState([]);
  const [notesByPatient, setNotesByPatient] = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    async function load() {
      try {
        const pd = await api.get('/patients/search', { q: '', limit: 20, offset: 0 });
        setPatients(pd.items);

        // Fetch latest note per patient in parallel (limit 3 each)
        const entries = await Promise.all(
          pd.items.map(async p => {
            try {
              const nd = await api.get(`/patients/${p.id}/notes`, { limit: 3, offset: 0 });
              return [p.id, nd.items];
            } catch { return [p.id, []]; }
          })
        );
        setNotesByPatient(Object.fromEntries(entries));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Flatten and sort all notes by date descending
  const allNotes = patients.flatMap(p =>
    (notesByPatient[p.id] || []).map(n => ({ ...n, patient: p }))
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <>
      <Topbar crumbs={['Visits']} />
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-title">Recent visits</div>
            <div className="page-sub">Latest notes across all patients</div>
          </div>
        </div>

        {error && <div className="msg error mb-3"><Icon name="alert-circle" />{error}</div>}
        {loading && <div className="row gap-2 muted"><span className="spinner" /> Loading visits…</div>}

        {!loading && allNotes.length === 0 && (
          <div className="msg neutral">
            <Icon name="file-text" /> No visits recorded yet. Start a new visit from the patient detail page.
          </div>
        )}

        {!loading && allNotes.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <div className="row" style={{
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              fontSize: 11.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.04em', gap: 14,
            }}>
              <div style={{ flex: 1.2 }}>Date</div>
              <div style={{ flex: 2 }}>Patient</div>
              <div style={{ flex: 2 }}>Chief complaint</div>
              <div style={{ flex: 1 }}>Mode</div>
              <div style={{ flex: '.8', textAlign: 'right' }}>Status</div>
            </div>

            {allNotes.map(note => {
              const fin = note.status === 'finalized';
              return (
                <div
                  key={note.id}
                  className="card-row"
                  onClick={async () => {
                    try {
                      const full = await api.get(`/notes/${note.id}`);
                      goto('note_detail', { note: full, patient: note.patient });
                    } catch { /* ignore */ }
                  }}
                >
                  <div style={{ flex: 1.2, fontSize: 13, color: 'var(--fg-2)' }} className="mono">
                    {note.created_at.slice(0, 10)}
                  </div>
                  <div style={{ flex: 2, minWidth: 0 }}>
                    <div className="bold truncate" style={{ fontSize: 13 }}>{note.patient.full_name}</div>
                    <div className="mono muted text-xs">{note.patient.display_id}</div>
                  </div>
                  <div style={{ flex: 2, fontSize: 13, color: 'var(--fg-2)' }} className="truncate">
                    {note.chief_complaint || <em className="muted">—</em>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="pill">
                      <Icon name={MODE_ICON[note.input_mode] || 'file-text'} size={11} />
                      {note.input_mode}
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
        )}
      </div>
    </>
  );
}
