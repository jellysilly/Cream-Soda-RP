import type { CSSProperties, ReactNode } from 'react';

/** Line icons from the Cream Soda design (24×24, rounded strokes). */
const PATHS: Record<string, ReactNode> = {
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  chars: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c.9-3.9 3.8-6 7.5-6s6.6 2.1 7.5 6" />
    </>
  ),
  presets: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  generator: (
    <>
      <path d="M4 20 15 9" />
      <path d="M15 3v3M13.5 4.5h3M19.5 8v2M18.5 9h2M9 3v2M8 4h2" />
    </>
  ),
  memory: (
    <>
      <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" />
      <path d="M5 16a4 4 0 0 1 4-4h10" />
    </>
  ),
  images: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4 17 5-4 4 3 3-2 4 3" />
    </>
  ),
  regex: (
    <>
      <path d="M8 4c-2 2.5-3 5-3 8s1 5.5 3 8M16 4c2 2.5 3 5 3 8s-1 5.5-3 8" />
      <path d="M12 8v6M9.5 9.5l5 3M14.5 9.5l-5 3" />
    </>
  ),
  modules: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <path d="M16.5 13.5v6M13.5 16.5h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10M18 10c0 4-6 3-11 7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  left: <path d="m15 6-6 6 6 6" />,
  right: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  up: <path d="m6 15 6-6 6 6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
  back: <path d="M19 12H6M11 6l-6 6 6 6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M6 12h12" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  check: <path d="m5 12 5 5 9-10" />,
  pin: <path d="M12 17v4M8 3h8l-1 7 3 3H6l3-3z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />,
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="3" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  bookmark: <path d="M6.5 4h11v16l-5.5-4-5.5 4z" />,
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" />
    </>
  ),
  attach: <path d="M19 11.5 12.4 18a4.5 4.5 0 0 1-6.4-6.4l7-7a3 3 0 0 1 4.2 4.2l-7 7a1.5 1.5 0 0 1-2.1-2.1L14.5 7.5" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  qr: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  note: (
    <>
      <path d="M5 4h14v11l-5 5H5z" />
      <path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4" />
    </>
  ),
  thought: (
    <>
      <path d="M7 15.5a5 5 0 1 1 3-9 5.5 5.5 0 0 1 9 4.5 4 4 0 0 1-4 4z" />
      <circle cx="6" cy="19" r="1.3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.01" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10v4.5M12 17.2v.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  folder: <path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  zap: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  scene: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M7 5.5 9 9M12 5.5 14 9M17 5.5 19 9M3.5 9h17" />
    </>
  ),
  group: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M2.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M10.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
    </>
  ),
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />,
  undo: <path d="M8.5 5 4 9.5 8.5 14M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2.3a3.6 3.6 0 0 0 3.6-3.6C20.5 6.6 16.7 3.5 12 3.5z" />
      <circle cx="7.8" cy="11" r="1.2" />
      <circle cx="10.5" cy="7.3" r="1.2" />
      <circle cx="15" cy="7.8" r="1.2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.8" />
      <path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
    </>
  ),
  rocket: (
    <>
      <path d="M14.5 4.5c2.8-.8 4.6-.8 5-.4.4.4.4 2.2-.4 5-.8 2.7-3.4 5.7-6.6 7.6l-3.6-3.6c1.9-3.2 4.9-5.8 7.6-6.6z" />
      <path d="M9 12.5 6.2 12 4 14l3.4.7M11.5 15l.5 2.8-2 2.2-.7-3.4M5 19c.4-1.5 1.3-2.4 2.3-2.6" />
      <circle cx="15.3" cy="8.7" r="1.4" />
    </>
  ),
};

const FILLED: Record<string, ReactNode> = {
  sparkle: <path d="M12 3c.7 5 2.9 7.2 8 8-5.1.8-7.3 3-8 8-.7-5-2.9-7.2-8-8 5.1-.8 7.3-3 8-8z" />,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />,
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="18.5" r="1.8" />
    </>
  ),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </>
  ),
  starFill: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
};

export type IconName = keyof typeof PATHS | keyof typeof FILLED;

export function Icon({ name, size = 20, stroke = 1.8, style, className }: { name: IconName | string; size?: number; stroke?: number; style?: CSSProperties; className?: string }) {
  const filled = FILLED[name];
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style} className={className}>
        {filled}
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      className={className}
    >
      {PATHS[name] || PATHS.info}
    </svg>
  );
}

/** The small cream-soda glass logo used at the top of the rail. */
export function SodaGlass({ size = 44, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Cream Soda">
      <circle cx="24" cy="14" r="8.5" fill={dark ? '#FFE9C4' : '#FFF6E3'} />
      <circle cx="28" cy="6" r="3.2" fill={dark ? '#FF4D6D' : '#E5243F'} />
      <path d="M12 18h24l-3 13c-.7 3.2-3.4 5-9 5s-8.3-1.8-9-5z" fill={dark ? '#5FB8F0' : '#A9DBF7'} />
      <path d="M24 36v6M17 43h14" stroke={dark ? '#7CC6F2' : '#86C6EC'} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
