import * as LucideIcons from 'lucide-react';

export default function Icon({ name, size = 16, ...props }) {
  const pascal = name.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
  const Comp = LucideIcons[pascal];
  if (!Comp) return null;
  return <Comp size={size} strokeWidth={1.75} {...props} />;
}
