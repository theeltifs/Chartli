import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';
import AllergyIcon from '../components/AllergyIcon';

function initials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function PatientSearch({ goto }) {
  const [q, setQ]         = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const LIMIT = 20;

  const search = useCallback(async (query, off = 0) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/patients/search', { q: query, limit: LIMIT, offset: off });
      setItems(data.items);
      setTotal(data.total);
      setOffset(off);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search('', 0); }, [search]);

  function handleSearch(e) {
    const val = e.target.value;
    setQ(val);
    search(val, 0);
  }

  return (
    <>
      <Topbar crumbs={['Patients']} />
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-title">Patients</div>
            {!loading && <div className="page-sub">{total} patient{total !== 1 ? 's' : ''}</div>}
          </div>
          <button className="btn primary" onClick={() => goto('new_patient')}>
            <Icon name="user-plus" /> Add patient
          </button>
        </div>

        <div className="field mb-4" style={{ maxWidth: 480 }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
            <input
              className="input"
              style={{ paddingLeft: 34 }}
              placeholder="Name or patient ID (e.g. P-2026-00001)"
              value={q}
              onChange={handleSearch}
              autoFocus
            />
          </div>
        </div>

        {error && <div className="msg error"><Icon name="alert-circle" />{error}</div>}

        {loading && (
          <div className="row gap-2 muted mt-4">
            <span className="spinner" /> Searching…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="msg neutral">
            <Icon name="users" />
            {q ? 'No patients matched your search.' : 'No patients yet. Click Add patient to get started.'}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <div className="row" style={{
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              gap: 14, fontSize: 11.5, color: 'var(--fg-3)',
              textTransform: 'uppercase', letterSpacing: '.04em'
            }}>
              <div style={{ flex: 2 }}>Patient</div>
              <div style={{ flex: 1 }}>Blood group</div>
              <div style={{ flex: 1.5 }}>Conditions</div>
              <div style={{ flex: '.6' }}></div>
            </div>

            {items.map(p => (
              <div className="card-row" key={p.id} onClick={() => goto('patient_detail', { patient: p })}>
                <div className="row gap-3" style={{ flex: 2, minWidth: 0 }}>
                  <div className="avatar">{initials(p.full_name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="bold truncate">{p.full_name}</div>
                    <div className="row gap-2 mt-1">
                      <span className="mono muted text-xs">{p.display_id}</span>
                      <span className="muted text-xs">·</span>
                      <span className="muted text-xs">{p.age} y · {p.gender.replace('_', ' ')}</span>
                      {p.allergies && <span className="pill warning text-xs"><AllergyIcon size={11} /> Allergy</span>}
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--fg-2)' }}>{p.blood_group || '—'}</div>
                <div style={{ flex: 1.5, fontSize: 13, color: 'var(--fg-2)' }} className="truncate">
                  {p.chronic_conditions || '—'}
                </div>
                <div style={{ flex: '.6', textAlign: 'right' }}>
                  <button className="btn sm ghost" onClick={e => { e.stopPropagation(); goto('patient_detail', { patient: p }); }}>
                    Open <Icon name="arrow-right" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {total > LIMIT && (
          <div className="pagination">
            <button className="btn sm" disabled={offset === 0} onClick={() => search(q, offset - LIMIT)}>
              <Icon name="chevron-left" /> Previous
            </button>
            <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <button className="btn sm" disabled={offset + LIMIT >= total} onClick={() => search(q, offset + LIMIT)}>
              Next <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
