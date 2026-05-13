import { useState } from 'react';
import { api } from '../api';
import Topbar from '../components/Topbar';
import SoapEditor from '../components/SoapEditor';
import Icon from '../components/Icon';

const MODE_LABEL = { typed: 'Typed', dictation: 'Dictation', conversation: 'Conversation' };
const MODE_ICON  = { typed: 'keyboard', dictation: 'mic', conversation: 'messages-square' };

export default function NoteDetail({ note: initialNote, patient, goto }) {
  const [note, setNote]       = useState(initialNote);
  const [soap, setSoap]       = useState({
    subjective: note.soap_subjective ?? note.ai_subjective ?? '',
    objective:  note.soap_objective  ?? note.ai_objective  ?? '',
    assessment: note.soap_assessment ?? note.ai_assessment ?? '',
    plan:       note.soap_plan       ?? note.ai_plan       ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);

  const fin = note.status === 'finalized';
  const date = note.created_at.slice(0, 10);
  const modeIcon  = MODE_ICON[note.input_mode]  || 'file-text';
  const modeLabel = MODE_LABEL[note.input_mode] || note.input_mode;

  async function handleSave() {
    setLoading(true); setError(''); setSaved(false);
    try {
      const updated = await api.patch(`/notes/${note.id}`, {
        soap_subjective: soap.subjective,
        soap_objective:  soap.objective,
        soap_assessment: soap.assessment,
        soap_plan:       soap.plan,
      });
      setNote(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleFinalize() {
    setLoading(true); setError('');
    try {
      await api.patch(`/notes/${note.id}`, {
        soap_subjective: soap.subjective,
        soap_objective:  soap.objective,
        soap_assessment: soap.assessment,
        soap_plan:       soap.plan,
      });
      const updated = await api.post(`/notes/${note.id}/finalize`);
      setNote(updated);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleGenerateSummary() {
    setLoading(true); setError('');
    try {
      const res = await api.post(`/notes/${note.id}/patient-summary`);
      setNote(n => ({ ...n, patient_summary: res.patient_summary }));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function downloadSummary() {
    const blob = new Blob([note.patient_summary], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'visit_summary.txt' });
    a.click();
    URL.revokeObjectURL(url);
  }

  // Detect if doctor has edited from AI original
  const editedAny = ['subjective', 'objective', 'assessment', 'plan'].some(k =>
    note[`soap_${k}`] != null && note[`soap_${k}`] !== note[`ai_${k}`]
  );

  return (
    <>
      <Topbar crumbs={['Patients', patient?.full_name ?? 'Patient', date]} />
      <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>

        <div className="page-head">
          <div>
            <button className="btn ghost sm mb-2" onClick={() => goto('patient_detail', { patient })}>
              <Icon name="arrow-left" /> Back to patient
            </button>
            <div className="page-title row gap-3">
              <Icon name={modeIcon} />
              {date}
            </div>
            <div className="row gap-3 mt-1">
              <span className={`pill ${fin ? 'success' : 'warning'}`}>
                <span className="dot" />{fin ? 'Finalized' : 'Draft'}
              </span>
              <span className="pill"><Icon name={modeIcon} size={11} /> {modeLabel}</span>
              <span className="mono muted text-xs">{note.id}</span>
            </div>
          </div>
        </div>

        {note.chief_complaint && (
          <div className="msg info mb-4">
            <Icon name="message-square" />
            <div><strong>Chief complaint:</strong> {note.chief_complaint}</div>
          </div>
        )}

        {error  && <div className="msg error mb-3"><Icon name="alert-circle" />{error}</div>}
        {saved  && <div className="msg success mb-3"><Icon name="check-circle" />Saved.</div>}

        <div className="card">
          <div className="bold mb-1">SOAP Note</div>
          <SoapEditor soap={soap} onChange={setSoap} readOnly={fin} />
        </div>

        {!fin && (
          <div className="row gap-3 mt-4">
            <button className="btn" disabled={loading} onClick={handleSave}>
              {loading ? <span className="spinner" /> : <Icon name="save" />} Save
            </button>
            <button className="btn primary" disabled={loading} onClick={handleFinalize}>
              {loading ? <span className="spinner" /> : <Icon name="check-circle-2" />} Finalize
            </button>
          </div>
        )}

        {/* AI-original diff (only for finalized notes that were edited) */}
        {fin && editedAny && (
          <details className="card mt-4" style={{ cursor: 'pointer' }}>
            <summary className="bold" style={{ padding: '4px 0', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="history" size={14} /> View AI-original (before doctor edits)
            </summary>
            <div className="mt-3">
              {['subjective', 'objective', 'assessment', 'plan'].map(k => (
                note[`ai_${k}`] ? (
                  <div key={k} className="col gap-1 mb-3">
                    <div className="muted text-xs bold">{k.toUpperCase()}</div>
                    <div style={{ fontSize: 13.5, color: 'var(--fg-2)' }}>{note[`ai_${k}`]}</div>
                  </div>
                ) : null
              ))}
            </div>
          </details>
        )}

        {/* Patient summary */}
        <div className="summary-panel">
          <div className="sp-head">
            <div className="sp-icon"><Icon name="sparkles" /></div>
            <div>
              <div className="bold">Patient-friendly summary</div>
              <div className="muted text-sm">Plain-language version for the patient</div>
            </div>
          </div>

          {note.patient_summary ? (
            <>
              <textarea className="textarea mt-3" rows={6} value={note.patient_summary}
                readOnly style={{ background: 'var(--bg-1)' }} />
              <div className="row gap-3 mt-3">
                <span className="muted text-xs" style={{ marginRight: 'auto' }}>
                  {note.patient_summary.split(/\s+/).length} words
                </span>
                <button className="btn sm" onClick={downloadSummary}>
                  <Icon name="download" /> Download
                </button>
                {!fin && (
                  <button className="btn sm" disabled={loading} onClick={handleGenerateSummary}>
                    <Icon name="refresh-cw" /> Regenerate
                  </button>
                )}
              </div>
            </>
          ) : fin ? (
            <button className="btn primary sm mt-3" disabled={loading} onClick={handleGenerateSummary}>
              {loading ? <span className="spinner" /> : <Icon name="sparkles" />} Generate summary
            </button>
          ) : (
            <div className="muted text-sm mt-2">Summary will be available after finalizing.</div>
          )}
        </div>

        {/* Metadata */}
        <details className="card mt-4">
          <summary className="bold" style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="info" size={14} /> Note metadata
          </summary>
          <div className="mt-3 col gap-2 text-sm muted mono" style={{ fontSize: 12 }}>
            {[
              ['Note ID', note.id],
              ['Input mode', note.input_mode],
              ['AI model', note.ai_model],
              ['Generation time', note.generation_ms ? `${note.generation_ms} ms` : '—'],
              ['Transcription time', note.transcription_ms ? `${note.transcription_ms} ms` : '—'],
              ['Audio duration', note.audio_duration_seconds ? `${note.audio_duration_seconds.toFixed(1)}s` : '—'],
              ['Created', note.created_at],
              ['Finalized', note.finalized_at ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="row gap-3">
                <span style={{ minWidth: 140, color: 'var(--fg-2)' }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}
