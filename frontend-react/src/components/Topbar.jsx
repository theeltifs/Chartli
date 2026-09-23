import Icon from './Icon';

export default function Topbar({ crumbs = [] }) {
  return (
    <header className="topbar modern-topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="row gap-1">
            {i > 0 && <span className="sep"><Icon name="chevron-right" size={12} /></span>}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </span>
        ))}
      </div>
      <div className="topbar-meta">
        <span className="api-status"><i /> Workspace online</span>
        <span className="topbar-date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
    </header>
  );
}