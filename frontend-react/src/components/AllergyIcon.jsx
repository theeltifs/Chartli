export default function AllergyIcon({ size = 16 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-flex', flexShrink: 0, verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      {/* Allergen / pollen particle — nucleus + 8 spikes */}
      <circle cx="8" cy="8" r="2.2" fill="currentColor" fillOpacity="0.22" />
      <line x1="8" y1="1.5" x2="8" y2="4.2" />
      <line x1="8" y1="11.8" x2="8" y2="14.5" />
      <line x1="1.5" y1="8" x2="4.2" y2="8" />
      <line x1="11.8" y1="8" x2="14.5" y2="8" />
      <line x1="3.1" y1="3.1" x2="5.0" y2="5.0" />
      <line x1="11.0" y1="11.0" x2="12.9" y2="12.9" />
      <line x1="12.9" y1="3.1" x2="11.0" y2="5.0" />
      <line x1="5.0" y1="11.0" x2="3.1" y2="12.9" />
    </svg>
  );
}
