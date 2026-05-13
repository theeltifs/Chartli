import Icon from './Icon';

export default function StepBar({ steps, current }) {
  return (
    <div className="steps">
      {steps.map((label, i) => {
        const cls = i < current ? 'done' : i === current ? 'active' : '';
        return (
          <div key={i} className={`step ${cls}`}>
            <span className="num">
              {i < current ? <Icon name="check" size={11} /> : i + 1}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}
