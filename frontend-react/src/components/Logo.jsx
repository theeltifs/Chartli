export function LogoMark({ size = 36 }) {
  const id = `chartli-gradient-${size}`;
  return (
    <svg
      className="chartli-logo-mark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Chartli logo"
    >
      <defs>
        <linearGradient id={id} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14b8a6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="18" fill={`url(#${id})`} />
      <path d="M43 22.5a16 16 0 1 0 0 19" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <path d="M19 33h8l3-7 5 14 3-7h8" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoFull({ height = 40, inverse = false }) {
  return (
    <div className={`logo-lockup ${inverse ? 'inverse' : ''}`} style={{ '--logo-height': `${height}px` }}>
      <LogoMark size={height} />
      <div className="logo-type">
        <span className="logo-word">Chartli</span>
        <span className="logo-descriptor">Clinical intelligence</span>
      </div>
    </div>
  );
}