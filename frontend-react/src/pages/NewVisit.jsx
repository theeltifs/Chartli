import { useState, useRef } from 'react';
import { api } from '../api';
import { useRecorder } from '../hooks/useRecorder';
import Topbar from '../components/Topbar';
import StepBar from '../components/StepBar';
import AllergyBar from '../components/AllergyBar';
import SoapEditor from '../components/SoapEditor';
import VitalsForm from '../components/VitalsForm';
import Icon from '../components/Icon';

const STEPS_VOICE  = ['Input', 'Review transcript', 'Generate SOAP', 'Finalize'];
const STEPS_TYPED  = ['Input', 'Generate SOAP', 'Finalize'];

function stepIndex(stage, isVoice) {
  if (!isVoice) return { input: 0, soap_editing: 1, done: 2 }[stage] ?? 2;
  return { input: 0, transcript_review: 1, soap_editing: 2, done: 3 }[stage] ?? 3;
}

// ── Audio tab (record + upload) ───────────────────────────────────────────
function AudioTab({ mode, onBlobReady }) {
  const rec = useRecorder();
  const fileRef = useRef(null);
  const [uploadedBlob, setUploadedBlob] = useState(null);
  const [uploadName, setUploadName]     = useState('');

  const activeBlob = rec.blob || uploadedBlob;

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setUploadedBlob(f);
    setUploadName(f.name);
    rec.reset();
  }

  function handleUse() {
    if (activeBlob) onBlobReady(activeBlob, rec.blob ? `recording_${mode}.webm` : uploadName);
  }

  return (
    <div className="col gap-4">
      {/* Record */}
      <div className="card">
        <div className="bold mb-3 row gap-2"><Icon name="mic" /> Live recording</div>

        {rec.micError && <div className="msg error mb-3"><Icon name="alert-circle" />{rec.micError}</div>}

        <div className="row gap-4" style={{ alignItems: 'center' }}>
          {rec.recState === 'recording' ? (
            <button className="rec-btn live" onClick={rec.stop} title="Stop recording">
              <Icon name="square" size={22} />
            </button>
          ) : (
            <button className="rec-btn" onClick={rec.start} title="Start recording">
              <Icon name="mic" size={22} />
            </button>
          )}

          <div style={{ flex: 1 }}>
            <div className="row between mb-2" style={{ alignItems: 'baseline' }}>
              <div>
                <div className="bold" style={{ fontSize: 15 }}>
                  {rec.recState === 'recording' ? 'Recording…' : rec.recState === 'stopped' ? 'Recording complete' : 'Ready to record'}
                </div>
                <div className="muted text-sm">
                  {mode === 'conversation' ? 'Two-party mode' : 'Solo dictation'} · Audio is not stored
                </div>
              </div>
              {rec.recState === 'recording' && (
                <div className="mono bold" style={{ fontSize: 18 }}>{rec.fmt(rec.elapsed)}</div>
              )}
            </div>

            <div className="wave">
              {rec.bars.map((h, i) => (
                <div className="bar" key={i} style={{ height: h + 'px' }} />
              ))}
            </div>

            {rec.recState === 'stopped' && rec.blob && (
              <div className="msg success mt-2" style={{ fontSize: 12.5 }}>
                <Icon name="check-circle" />
                Recording ready — {Math.round(rec.blob.size / 1024)} KB · {rec.fmt(rec.elapsed)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload */}
      <div>
        <div className="muted text-sm mb-2 bold">Or upload an audio file</div>
        <div className="upload-zone" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,.flac" onChange={handleFile} />
          <Icon name="upload-cloud" size={24} style={{ color: 'var(--fg-3)', marginBottom: 8 }} />
          <div className="muted text-sm">Click to browse · mp3 wav m4a ogg webm flac · max 25 MB</div>
          {uploadedBlob && !rec.blob && (
            <div className="msg success mt-3" style={{ fontSize: 12.5, textAlign: 'left' }}>
              <Icon name="check-circle" /> {uploadName} · {Math.round(uploadedBlob.size / 1024)} KB
            </div>
          )}
        </div>
      </div>

      {activeBlob && (
        <button className="btn primary" onClick={handleUse}>
          Transcribe → <Icon name="arrow-right" />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function NewVisit({ patient, goto }) {
  const [stage, setStage]         = useState('input');
  const [activeTab, setActiveTab] = useState('typed');
  const [cc, setCc]               = useState('');
  const [vitals, setVitals]       = useState(null);
  const [typedText, setTypedText] = useState('');

  // Transcript review
  const [transcript, setTranscript]     = useState('');
  const [transcriptLang, setTranscriptLang] = useState('');
  const [transcriptMode, setTranscriptMode] = useState('typed');
  const [audioDuration, setAudioDuration]   = useState(0);

  // SOAP editing
  const [noteId, setNoteId]         = useState('');
  const [soap, setSoap]             = useState({ subjective: '', objective: '', assessment: '', plan: '' });
  const [genMs, setGenMs]           = useState(0);
  const [finalized, setFinalized]   = useState(false);
  const [fallback, setFallback]     = useState(false);
  const [summary, setSummary]       = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const isVoice  = activeTab !== 'typed';
  const stepsArr = (stage === 'input' && !isVoice) || stage === 'soap_editing' || stage === 'done'
    ? (transcriptMode === 'typed' ? STEPS_TYPED : STEPS_VOICE)
    : STEPS_VOICE;
  const stepIdx  = stepIndex(stage, transcriptMode !== 'typed');

  // ── Generate SOAP ─────────────────────────────────────────────────────
  async function generateSoap(raw, mode) {
    setLoading(true);
    setError('');
    try {
      const payload = { patient_id: patient.id, raw_input: raw, input_mode: mode };
      if (vitals)      payload.vitals = vitals;
      if (cc.trim())   payload.chief_complaint = cc.trim();

      const res = await api.post('/notes/generate', payload);
      setNoteId(res.note_id);
      setSoap(res.soap);
      setGenMs(res.generation_ms);
      setFallback((res.soap.subjective || '').includes('AI generation failed'));
      setFinalized(false);
      setSummary(null);
      setStage('soap_editing');

      // Generate patient summary in background
      generateSummary(res.note_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Transcribe ────────────────────────────────────────────────────────
  async function handleTranscribe(blob, filename) {
    setLoading(true);
    setError('');
    const fd = new FormData();
    fd.append('audio', blob, filename);
    fd.append('mode', activeTab);
    try {
      const res = await api.postForm('/transcribe', fd);
      setTranscript(res.transcript || '');
      setTranscriptLang(res.detected_language || 'en');
      setAudioDuration(res.duration_seconds || 0);
      setTranscriptMode(activeTab);
      setStage('transcript_review');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Patient summary ───────────────────────────────────────────────────
  async function generateSummary(id) {
    setSummary(null);
    try {
      const res = await api.post(`/notes/${id}/patient-summary`);
      setSummary(res.patient_summary);
    } catch {
      setSummary('');
    }
  }

  // ── Save draft ────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    setLoading(true);
    setError('');
    try {
      await api.patch(`/notes/${noteId}`, {
        soap_subjective: soap.subjective,
        soap_objective:  soap.objective,
        soap_assessment: soap.assessment,
        soap_plan:       soap.plan,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────
  async function handleFinalize() {
    setLoading(true);
    setError('');
    try {
      await api.patch(`/notes/${noteId}`, {
        soap_subjective: soap.subjective,
        soap_objective:  soap.objective,
        soap_assessment: soap.assessment,
        soap_plan:       soap.plan,
      });
      await api.post(`/notes/${noteId}/finalize`);
      setFinalized(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Discard ───────────────────────────────────────────────────────────
  async function handleDiscard() {
    if (!confirm('Discard this note? This cannot be undone.')) return;
    try { await api.delete(`/notes/${noteId}`); } catch { /* ignore */ }
    goto('patient_detail', { patient });
  }

  // ── Download summary ──────────────────────────────────────────────────
  function downloadSummary() {
    const blob = new Blob([summary], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'visit_summary.txt' });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Topbar crumbs={['Patients', patient.full_name, 'New visit']} />
      <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>

        <div className="page-head">
          <div>
            <button className="btn ghost sm mb-2"
              onClick={() => stage === 'input' ? goto('patient_detail', { patient }) : setStage('input')}>
              <Icon name="arrow-left" /> {stage === 'input' ? 'Back to patient' : 'Back to input'}
            </button>
            <div className="page-title">New visit</div>
            <div className="page-sub"><strong>{patient.full_name}</strong> · <span className="mono">{patient.display_id}</span></div>
          </div>
          {stage !== 'soap_editing' && (
            <button className="btn ghost sm" onClick={() => goto('patient_detail', { patient })}>
              <Icon name="x" /> Discard
            </button>
          )}
        </div>

        <StepBar steps={stepsArr} current={stepIdx} />

        {patient.allergies && stage === 'input' && (
          <AllergyBar text={patient.allergies} label="Allergy reminder" />
        )}

        {error && <div className="msg error mb-4"><Icon name="alert-circle" />{error}</div>}

        {/* ── INPUT STAGE ──────────────────────────────────────────────── */}
        {stage === 'input' && (
          <div className="col gap-4">
            <div className="card">
              <div className="field mb-4">
                <label className="label">Chief complaint</label>
                <input className="input" placeholder="e.g. Headache for 3 days with fever"
                  maxLength={200} value={cc} onChange={e => setCc(e.target.value)} />
              </div>
              <VitalsForm onChange={setVitals} />
            </div>

            <div className="card">
              <div className="bold mb-1">How would you like to document this visit?</div>
              <div className="muted text-sm mb-4">Choose an input method below.</div>

              <div className="mode-tabs">
                {[
                  { key: 'typed', icon: 'keyboard', label: 'Type notes' },
                  { key: 'dictation', icon: 'mic', label: 'Dictate (solo)' },
                  { key: 'conversation', icon: 'messages-square', label: 'Record conversation' },
                ].map(t => (
                  <button key={t.key} className={`mode-tab ${activeTab === t.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.key)}>
                    <Icon name={t.icon} /> {t.label}
                  </button>
                ))}
              </div>

              {activeTab === 'typed' && (
                <div className="col gap-3">
                  <div className="msg info" style={{ fontSize: 12.5 }}>
                    <Icon name="info" />
                    Type your clinical shorthand. The AI will structure it into a SOAP note.
                  </div>
                  <textarea className="textarea" rows={8}
                    placeholder="Patient presents with… Examination shows… Plan: …"
                    maxLength={10000}
                    value={typedText} onChange={e => setTypedText(e.target.value)} />
                  <button className="btn primary" disabled={!typedText.trim() || loading}
                    onClick={() => generateSoap(typedText.trim(), 'typed')}>
                    {loading ? <><span className="spinner" />Generating…</> : <>Generate SOAP Note <Icon name="arrow-right" /></>}
                  </button>
                </div>
              )}

              {activeTab === 'dictation' && (
                <div className="col gap-3">
                  <div className="msg info" style={{ fontSize: 12.5 }}>
                    <Icon name="info" />
                    Speak your notes after the visit — solo voice only. Audio is transcribed then discarded.
                  </div>
                  {loading
                    ? <div className="row gap-2 muted"><span className="spinner" /> Transcribing audio…</div>
                    : <AudioTab mode="dictation" onBlobReady={handleTranscribe} />}
                </div>
              )}

              {activeTab === 'conversation' && (
                <div className="col gap-3">
                  <div className="msg info" style={{ fontSize: 12.5 }}>
                    <Icon name="info" />
                    Place a recorder between you and the patient. Both voices are captured; AI extracts only clinical content.
                  </div>
                  {loading
                    ? <div className="row gap-2 muted"><span className="spinner" /> Transcribing audio…</div>
                    : <AudioTab mode="conversation" onBlobReady={handleTranscribe} />}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRANSCRIPT REVIEW ────────────────────────────────────────── */}
        {stage === 'transcript_review' && (
          <div className="card col gap-4">
            {audioDuration > 0 && <div className="muted text-sm">Audio duration: {audioDuration.toFixed(1)}s</div>}

            {!transcript && (
              <div className="msg neutral">
                <Icon name="info" />
                No speech was detected. You can type notes manually or go back and re-record.
              </div>
            )}
            {transcriptLang && transcriptLang !== 'en' && (
              <div className="msg neutral">
                <Icon name="languages" />
                Non-English audio detected ({transcriptLang.toUpperCase()}) — review the transcript carefully.
              </div>
            )}

            <div className="field">
              <label className="label">Transcript — review and correct before generating SOAP</label>
              <textarea className="textarea" rows={10}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Transcript will appear here…"
                maxLength={10000}
              />
            </div>

            <div className="row gap-3">
              <button className="btn" onClick={() => setStage('input')}>
                <Icon name="arrow-left" /> Re-record
              </button>
              <button className="btn primary" disabled={!transcript.trim() || loading}
                onClick={() => generateSoap(transcript.trim(), transcriptMode)}>
                {loading ? <><span className="spinner" />Generating…</> : <>Generate SOAP Note <Icon name="arrow-right" /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── SOAP EDITING ─────────────────────────────────────────────── */}
        {stage === 'soap_editing' && (
          <div className="col gap-4">
            {fallback && (
              <div className="msg neutral">
                <Icon name="info" />
                AI generation encountered an issue — the raw input has been placed in Subjective.
                Please complete the other sections manually.
              </div>
            )}

            <div className="muted text-sm">
              Generated in {genMs} ms · Draft ID: <span className="mono">{noteId}</span>
            </div>

            <div className="card">
              <SoapEditor soap={soap} onChange={setSoap} readOnly={finalized} />
            </div>

            {finalized ? (
              <div className="col gap-3">
                <div className="msg success"><Icon name="check-circle" />Note finalized — editing is locked.</div>
                <button className="btn primary" onClick={() => goto('patient_detail', { patient })}>
                  <Icon name="arrow-left" /> Return to patient
                </button>
              </div>
            ) : (
              <div className="row gap-3">
                <button className="btn" disabled={loading} onClick={handleSaveDraft}>
                  {loading ? <span className="spinner" /> : <Icon name="save" />} Save draft
                </button>
                <button className="btn primary" disabled={loading} onClick={handleFinalize}>
                  {loading ? <span className="spinner" /> : <Icon name="check-circle-2" />} Finalize note
                </button>
                <button className="btn danger" disabled={loading} onClick={handleDiscard}>
                  <Icon name="trash-2" /> Discard
                </button>
              </div>
            )}

            {/* Patient summary */}
            <div className="summary-panel">
              <div className="sp-head">
                <div className="sp-icon"><Icon name="sparkles" /></div>
                <div>
                  <div className="bold">Patient-friendly summary</div>
                  <div className="muted text-sm">Plain-language version for the patient</div>
                </div>
                {!finalized && summary !== null && (
                  <button className="btn sm" style={{ marginLeft: 'auto' }}
                    onClick={() => generateSummary(noteId)}>
                    <Icon name="refresh-cw" /> Regenerate
                  </button>
                )}
              </div>

              {summary === null && (
                <div className="row gap-2 muted text-sm"><span className="spinner" /> Generating summary…</div>
              )}
              {summary === '' && (
                <div className="muted text-sm">Summary could not be generated.</div>
              )}
              {summary && (
                <>
                  <textarea className="textarea mt-3" rows={6} value={summary}
                    readOnly style={{ background: 'var(--bg-1)' }} />
                  <div className="row between mt-2">
                    <span className="muted text-xs">{summary.split(/\s+/).length} words · target ≤ 150</span>
                    <button className="btn sm" onClick={downloadSummary}>
                      <Icon name="download" /> Download
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
