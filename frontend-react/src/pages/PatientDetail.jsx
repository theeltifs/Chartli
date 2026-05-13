import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Topbar from '../components/Topbar';
import AllergyBar from '../components/AllergyBar';
import AllergyIcon from '../components/AllergyIcon';
import Icon from '../components/Icon';

const MODE_ICON = { typed: 'keyboard', dictation: 'mic', conversation: 'messages-square' };

function initials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function PatientDetail({ patient: initialPatient, goto }) {
  const [patient, setPatient] = useState(initialPatient);
  const [notes, setNotes]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [offset, setOffset]   = useState(0);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [deleting, setDeleting] = useState(false);

  const LIMIT = 10;

  const load = useCallback(async (off = 0, statusFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const [p, n] = await Promise.all([
        api.get(`/patients/${patient.id}`),
        api.get(`/patients/${patient.id}/notes`, {
          limit: LIMIT, offset: off,
          ...(statusFilter !== 'all' && { status: statusFilter }),
        }),
      ]);
      setPatient(p);
      setNotes(n.items);
      setTotal(n.total);
      setOffset(off);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patient.id, filter]);

  useEffect(() => { load(0); }, []);

  function changeFilter(f) {
    setFilter(f);
    load(0, f);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${patient.full_name}"?\n\nThis will remove the patient and all their visits. This action cannot be undone.`))
      return;
    setDeleting(true);
    try {
      await api.delete(`/patients/${patient.id}`);
      goto('search');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  const genderLabel = patient.gender.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <>
      <Topbar crumbs={['Patients', patient.full_name]} />
      <div className="page">
        {error && <div className="msg error mb-3"><Icon name="alert-circle" />{error}</div>}

        {/* Patient header */}
        <div className="patient-header">
          <div className="row gap-4">
            <div className="avatar lg">{initials(patient.full_name)}</div>
            <div>
              <div className="page-title">{patient.full_name}</div>
              <div className="row gap-3 mt-1" style={{ color: 'var(--fg-3)', fontSize: 13 }}>
                <span className="mono">{patient.display_id}</span>
                <span>{patient.age} y · {genderLabel} {patient.blood_group ? `· ${patient.blood_group}` : ''}</span>
                {patient.allergies && <span className="pill warning"><AllergyIcon size={11} /> Allergies</span>}
              </div>
              {patient.contact && <div className="muted text-sm mt-1"><Icon name="phone" size={12} style={{ marginRight: 4 }} />{patient.contact}</div>}
            </div>
          </div>
          <div className="row gap-2">
            <button className="btn sm" onClick={() => goto('search')}>
              <Icon name="arrow-left" /> Back
            </button>
            <button className="btn primary" onClick={() => goto('new_visit', { patient })}>
              <Icon name="mic" /> Start visit
            </button>
            <button className="btn danger sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <span className="spinner" /> : <Icon name="trash-2" />}
              Delete
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="metrics">
          <div className="metric"><div className="lbl">Age</div><div className="val">{patient.age}</div><div className="sub">years old</div></div>
          <div className="metric"><div className="lbl">Gender</div><div className="val" style={{ fontSize: 16 }}>{genderLabel}</div></div>
          <div className="metric"><div className="lbl">Blood group</div><div className="val">{patient.blood_group || '—'}</div></div>
          <div className="metric"><div className="lbl">Patient ID</div><div className="val mono" style={{ fontSize: 14 }}>{patient.display_id}</div></div>
        </div>

        {/* Allergy */}
        <AllergyBar text={patient.allergies} />
        {patient.chronic_conditions && (
          <div className="msg neutral mb-2">
            <Icon name="clipboard-list" />
            <div><strong>Chronic conditions:</strong> {patient.chronic_conditions}</div>
          </div>
        )}

        <hr className="divider" />

        {/* Visit timeline */}
        <div className="section-head">
          <div className="section-title">Visit timeline</div>
          <div className="seg">
            {['all', 'finalized', 'draft'].map(f => (
              <button key={f} className={`seg-item ${filter === f ? 'active' : ''}`} onClick={() => changeFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="row gap-2 muted mt-4"><span className="spinner" /> Loading visits…</div>}

        {!loading && notes.length === 0 && (
          <div className="msg neutral">
            <Icon name="file-text" />
            {filter === 'all' ? 'No visits on record. Click Start visit to begin.' : `No ${filter} visits.`}
          </div>
        )}

        {notes.map(note => {
          const fin = note.status === 'finalized';
          const date = note.created_at.slice(0, 10);
          const modeIcon = MODE_ICON[note.input_mode] || 'file-text';
          return (
            <div className="note-card" key={note.id}
              onClick={async () => {
                try {
                  const full = await api.get(`/notes/${note.id}`);
                  goto('note_detail', { note: full, patient });
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              <div className="row between">
                <div className="row gap-3">
                  <span className="mono muted text-sm">{date}</span>
                  <span className={`pill ${fin ? 'success' : 'warning'}`}>
                    <span className="dot" />{fin ? 'Finalized' : 'Draft'}
                  </span>
                  <span className="pill"><Icon name={modeIcon} size={11} /> {note.input_mode}</span>
                </div>
                <button className="btn ghost sm">Open <Icon name="arrow-right" size={13} /></button>
              </div>
              {note.chief_complaint && <div className="bold mt-2">{note.chief_complaint}</div>}
              {note.soap_assessment && (
                <div className="muted text-sm mt-1">
                  {note.soap_assessment.slice(0, 100)}{note.soap_assessment.length > 100 ? '…' : ''}
                </div>
              )}
            </div>
          );
        })}

        {total > LIMIT && (
          <div className="pagination">
            <button className="btn sm" disabled={offset === 0} onClick={() => load(offset - LIMIT)}>
              <Icon name="chevron-left" /> Previous
            </button>
            <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <button className="btn sm" disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>
              Next <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
