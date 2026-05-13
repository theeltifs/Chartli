import { useState } from 'react';
import { api } from '../api';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'unknown'];

export default function NewPatient({ goto }) {
  const [form, setForm] = useState({
    full_name: '', age: '', gender: 'male', blood_group: '',
    contact: '', allergies: '', chronic_conditions: '',
  });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    if (!form.age || isNaN(parseInt(form.age))) { setError('Valid age is required.'); return; }

    setLoading(true);
    setError('');
    const payload = {
      full_name: form.full_name.trim(),
      age: parseInt(form.age),
      gender: form.gender,
    };
    if (form.blood_group)         payload.blood_group = form.blood_group;
    if (form.contact.trim())      payload.contact = form.contact.trim();
    if (form.allergies.trim())    payload.allergies = form.allergies.trim();
    if (form.chronic_conditions.trim()) payload.chronic_conditions = form.chronic_conditions.trim();

    try {
      const patient = await api.post('/patients', payload);
      goto('patient_detail', { patient });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Topbar crumbs={['Patients', 'New patient']} />
      <div className="page" style={{ maxWidth: 680 }}>
        <div className="page-head">
          <div>
            <button className="btn ghost sm mb-2" onClick={() => goto('search')}>
              <Icon name="arrow-left" /> Back
            </button>
            <div className="page-title">New patient</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="col gap-4">
          <div className="card">
            <div className="bold mb-3">Basic information</div>
            <div className="col gap-3">
              <div className="field">
                <label className="label">Full name <span className="req">*</span></label>
                <input className="input" placeholder="e.g. Sarah Ahmed" maxLength={120}
                  value={form.full_name} onChange={e => set('full_name', e.target.value)} autoFocus />
              </div>

              <div className="row gap-3">
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">Age <span className="req">*</span></label>
                  <input className="input" type="number" min="0" max="130" placeholder="30"
                    value={form.age} onChange={e => set('age', e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1.5 }}>
                  <label className="label">Gender <span className="req">*</span></label>
                  <select className="select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    {GENDERS.map(g => (
                      <option key={g} value={g}>{g.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">Blood group</label>
                  <select className="select" value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                    {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg || '— none —'}</option>)}
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="label">Contact number</label>
                <input className="input" placeholder="+92 300 0000000"
                  value={form.contact} onChange={e => set('contact', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="bold mb-3">Medical history</div>
            <div className="col gap-3">
              <div className="field">
                <label className="label">Known allergies</label>
                <textarea className="textarea" placeholder="e.g. Penicillin, Sulfa drugs" maxLength={1000} rows={3}
                  value={form.allergies} onChange={e => set('allergies', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Chronic conditions</label>
                <textarea className="textarea" placeholder="e.g. Type 2 Diabetes, Hypertension" maxLength={1000} rows={3}
                  value={form.chronic_conditions} onChange={e => set('chronic_conditions', e.target.value)} />
              </div>
            </div>
          </div>

          {error && <div className="msg error"><Icon name="alert-circle" />{error}</div>}

          <div className="row gap-3">
            <button type="button" className="btn" onClick={() => goto('search')}>Cancel</button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? <><span className="spinner" />Creating…</> : <><Icon name="user-plus" />Create patient</>}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
