type LogoProps = {
  size?: number;
  subtitle?: string;
};

export function Logo({ size = 28, subtitle = "Траектория" }: LogoProps) {
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect x="1" y="1" width="30" height="30" rx="9" fill="#FFE80A" />
        <path d="M10 10 L10 22" stroke="#0A0A0B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M10 10 L20 10" stroke="#0A0A0B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M10 16 L17 16" stroke="#0A0A0B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M10 22 L18 22" stroke="#0A0A0B" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M20.5 20.5 L23.5 23.5 M23.5 20.5 L20.5 23.5" stroke="#0A0A0B" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="col" style={{ lineHeight: 1 }}>
        <span style={{ fontWeight: 600, letterSpacing: "-0.02em", fontSize: 15 }}>Economix</span>
        <span className="t-eyebrow" style={{ fontSize: 9, marginTop: 3 }}>
          {subtitle}
        </span>
      </div>
    </div>
  );
}
