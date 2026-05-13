import { useState } from 'react';
import Icon from './Icon';

export default function VitalsForm({ onChange }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ bp: '', hr: '', temp_c: '', spo2: '', weight_kg: '' });

  function update(field, val) {
    const next = { ...v, [field]: val };
    setV(next);
    const out = {};
    if (next.bp.trim()) out.bp = next.bp.trim();
    if (next.hr)         out.hr = parseInt(next.hr);
    if (next.temp_c)     out.temp_c = parseFloat(next.temp_c);
    if (next.spo2)       out.spo2 = parseInt(next.spo2);
    if (next.weight_kg)  out.weight_kg = parseFloat(next.weight_kg);
    onChange(Object.keys(out).length ? out : null);
  }

  return (
    <div className="mb-4">
      <button type="button" className="btn ghost sm" onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        Vitals (optional)
      </button>

      {open && (
        <div className="vitals-grid">
          <div className="field">
            <label className="label">Blood pressure</label>
            <input className="input" placeholder="130/85" value={v.bp}
              onChange={e => update('bp', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Heart rate (bpm)</label>
            <input className="input" type="number" min="0" max="300" placeholder="72" value={v.hr}
              onChange={e => update('hr', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Temperature (°C)</label>
            <input className="input" type="number" min="30" max="45" step="0.1" placeholder="36.6" value={v.temp_c}
              onChange={e => update('temp_c', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">SpO₂ (%)</label>
            <input className="input" type="number" min="0" max="100" placeholder="98" value={v.spo2}
              onChange={e => update('spo2', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Weight (kg)</label>
            <input className="input" type="number" min="0" max="500" step="0.1" placeholder="70" value={v.weight_kg}
              onChange={e => update('weight_kg', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
