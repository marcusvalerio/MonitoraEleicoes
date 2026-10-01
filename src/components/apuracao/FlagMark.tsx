/**
 * Marca Eleições 2026 — interpretação geométrica e mínima da bandeira (não é a bandeira oficial):
 * campo verde, losango em traço amarelo, disco azul com um arco claro. Decorativa (aria-hidden).
 */
export function FlagMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 42 30" className={className} aria-hidden focusable="false">
      <rect x="0.5" y="0.5" width="41" height="29" rx="7" fill="#0f3d2a" stroke="#1d6b47" />
      <path d="M21 4.2 L37.2 15 L21 25.8 L4.8 15 Z" fill="none" stroke="#e7c35a" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="21" cy="15" r="6.4" fill="#1b3f8f" />
      <path d="M15.2 14.1 C18.6 12.6 23.6 12.7 26.8 15.3" fill="none" stroke="#e8edf7" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
