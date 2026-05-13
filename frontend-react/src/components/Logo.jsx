export function LogoMark({ size = 28 }) {
  return (
    <svg
      className="logo-mark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Chartli mark"
    >
      <g
        transform="translate(8,8)"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      >
        <path d="M14 6 v18 a14 14 0 0 0 28 0 V6" />
        <path d="M14 6 h-4" />
        <path d="M42 6 h4" />
        <path d="M28 38 v8 a8 8 0 0 0 8 8" />
        <circle cx="42" cy="54" r="6" />
      </g>
    </svg>
  );
}

export function LogoFull({ height = 36 }) {
  return (
    <svg
      className="logo-mark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 80"
      height={height}
      role="img"
      aria-label="Chartli"
      style={{ display: 'block' }}
    >
      <g
        transform="translate(8,12)"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      >
        <path d="M14 6 v18 a14 14 0 0 0 28 0 V6" />
        <path d="M14 6 h-4" />
        <path d="M42 6 h4" />
        <path d="M28 38 v10 a10 10 0 0 0 10 10" />
        <circle cx="46" cy="58" r="6" />
      </g>
      <text
        x="78" y="54"
        fontFamily="IBM Plex Sans, system-ui, sans-serif"
        fontWeight="700"
        fontSize="32"
        fill="currentColor"
        letterSpacing="-1"
      >
        Chartli
      </text>
    </svg>
  );
}
