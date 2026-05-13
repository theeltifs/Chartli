const SECTIONS = [
  { key: 'subjective', rail: 's', label: 'Subjective', tip: 'What the patient reported: symptoms, history, timeline.', rows: 5 },
  { key: 'objective',  rail: 'o', label: 'Objective',  tip: 'Measurable findings: vitals, exam, observations.', rows: 3 },
  { key: 'assessment', rail: 'a', label: 'Assessment', tip: 'Working diagnosis or differential.', rows: 3 },
  { key: 'plan',       rail: 'p', label: 'Plan',       tip: 'Treatment, medications, tests, follow-up.', rows: 5 },
];

export default function SoapEditor({ soap, onChange, readOnly = false }) {
  return (
    <div>
      {SECTIONS.map(({ key, rail, label, tip, rows }) => (
        <div className="soap" key={key}>
          <div className={`soap-rail ${rail}`}>{rail.toUpperCase()}</div>
          <div>
            <div className="soap-h">{label}</div>
            <div className="soap-tip">{tip}</div>
            {readOnly ? (
              <div className="soap-body">{soap[key] || <em style={{ color: 'var(--fg-3)' }}>Not documented</em>}</div>
            ) : (
              <textarea
                className="textarea soap-body"
                value={soap[key] || ''}
                rows={rows}
                placeholder={tip}
                onChange={e => onChange({ ...soap, [key]: e.target.value })}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
