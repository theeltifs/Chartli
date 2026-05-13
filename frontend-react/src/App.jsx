import { useState, useCallback, useEffect } from 'react';
import { setPin } from './api';
import Sidebar from './components/Sidebar';
import LandingPage from './pages/LandingPage';
import PinGate from './pages/PinGate';
import PatientPortal from './pages/PatientPortal';
import PatientSearch from './pages/PatientSearch';
import NewPatient from './pages/NewPatient';
import PatientDetail from './pages/PatientDetail';
import NewVisit from './pages/NewVisit';
import NoteDetail from './pages/NoteDetail';
import TodayPage from './pages/TodayPage';
import VisitsPage from './pages/VisitsPage';
import SettingsPage from './pages/SettingsPage';

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('chartli-theme') || 'clinic');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chartli-theme', theme);
  }, [theme]);

  const toggle = useCallback(() =>
    setTheme(t => (t === 'clinic' ? 'aurora' : 'clinic')), []);

  return { theme, toggle };
}

export default function App() {
  const { theme, toggle } = useTheme();

  // role: 'landing' | 'doctor-pin' | 'doctor' | 'patient'
  const [role, setRole]   = useState('landing');
  const [page, setPage]   = useState('search');
  const [patient, setPatient] = useState(null);
  const [note, setNote]       = useState(null);

  const goto = useCallback((p, state = {}) => {
    setPage(p);
    if ('patient' in state) setPatient(state.patient ?? patient);
    if ('note'    in state) setNote(state.note);
  }, [patient]);

  function signOut() {
    setPin('');
    setPatient(null);
    setNote(null);
    setPage('search');
    setRole('landing');
  }

  // ── Landing ───────────────────────────────────────────────────────────
  if (role === 'landing') {
    return (
      <LandingPage
        theme={theme}
        onToggleTheme={toggle}
        onDoctor={() => setRole('doctor-pin')}
        onPatient={() => setRole('patient')}
      />
    );
  }

  // ── Patient portal ────────────────────────────────────────────────────
  if (role === 'patient') {
    return <PatientPortal onBack={() => setRole('landing')} />;
  }

  // ── Doctor PIN gate ───────────────────────────────────────────────────
  if (role === 'doctor-pin') {
    return (
      <PinGate
        onSuccess={() => setRole('doctor')}
        onBack={() => setRole('landing')}
      />
    );
  }

  // ── Doctor app ────────────────────────────────────────────────────────
  const doctorPages = {
    today:          <TodayPage goto={goto} />,
    search:         <PatientSearch goto={goto} />,
    visits:         <VisitsPage goto={goto} />,
    settings:       <SettingsPage theme={theme} onToggleTheme={toggle} />,
    new_patient:    <NewPatient goto={goto} />,
    patient_detail: patient ? <PatientDetail key={patient.id} patient={patient} goto={goto} /> : null,
    new_visit:      patient ? <NewVisit key={`nv-${patient.id}`} patient={patient} goto={goto} /> : null,
    note_detail:    note    ? <NoteDetail key={note.id} note={note} patient={patient} goto={goto} /> : null,
  };

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        patient={patient}
        goto={goto}
        onSignOut={signOut}
        theme={theme}
        onToggleTheme={toggle}
      />
      <div className="app-main">
        {doctorPages[page] ?? <PatientSearch goto={goto} />}
      </div>
    </div>
  );
}
