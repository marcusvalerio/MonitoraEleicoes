export function LogoMark({ size = 22 }: { size?: number }) {
  // Marca: barras de "sinal" (dados) sobre linha de base — neutra, sem cores partidárias.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="#f0ede6" stroke="#cfc9bd" />
      <rect x="6" y="12" width="2.4" height="6" rx="1" fill="#85858c" />
      <rect x="10.8" y="8" width="2.4" height="10" rx="1" fill="#55555c" />
      <rect x="15.6" y="5" width="2.4" height="13" rx="1" fill="#1a1a1c" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-[13px] leading-none font-bold tracking-[0.06em] text-fg">
      MONITORA <span className="text-fg-2">ELEIÇÕES</span>
    </span>
  );
}
