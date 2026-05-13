import AllergyIcon from './AllergyIcon';

export default function AllergyBar({ text, label = 'Allergies' }) {
  if (!text) return null;
  return (
    <div className="allergy">
      <AllergyIcon size={17} />
      <div><strong>{label}:</strong> {text}</div>
    </div>
  );
}
