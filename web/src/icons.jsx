const ICONS = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </>
  ),
  bulb: (
    <>
      <circle cx="12" cy="10" r="5.5" />
      <path d="M9.5 15.5h5M10.5 18.5h3M12 4.5V3M5.5 6 4 4.5M18.5 6 20 4.5" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8.5" />
      <path d="M7.2 6.2A7 7 0 1 0 16.8 6.2" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v5M15 3.5v5" />
      <path d="M7 8.5h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5v-3Z" />
      <path d="M12 16.5v4" />
    </>
  ),
  thermo: (
    <>
      <path d="M10 4.5a2 2 0 0 1 4 0v9.2a3.6 3.6 0 1 1-4 0V4.5Z" />
      <path d="M12 9v7" />
      <path d="M15.5 6.5H18M15.5 9.5H17" />
    </>
  ),
  door: (
    <>
      <path d="M6 20.5V5.2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V20.5" />
      <path d="M4 20.5h16" />
      <circle cx="14.6" cy="12" r="1.1" />
    </>
  ),
  blinds: (
    <>
      <rect x="4.5" y="4" width="15" height="16" rx="1.5" />
      <path d="M4.5 8.5h15M4.5 13h15M4.5 17h15" />
    </>
  ),
  wind: (
    <>
      <path d="M3.5 8.5h10a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3.5 12.5h13" />
      <path d="M3.5 16.5h8.5a2.5 2.5 0 1 1-2.5 2.5" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-3 .8-5.5 2.4-6.2 2-.9 3 2 1.4 4.6" />
      <path d="M13.7 13c2.6 1.5 4.8 2.7 4.4 4.4-.5 2.1-3.5 1.2-5.2-1.6" />
      <path d="M10.3 13c-2.6 1.5-4.8 2.7-4.4 4.4.5 2.1 3.5 1.2 5.2-1.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="1.6" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      <circle cx="12" cy="15" r="1.2" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="6.5" width="13" height="11" rx="2" />
      <circle cx="9.5" cy="12" r="3" />
      <path d="m16 10.5 4.5-2.2v7.4L16 13.5" />
    </>
  ),
  speaker: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <circle cx="12" cy="9" r="2.6" />
      <path d="M9.5 16.5h5" />
    </>
  ),
  motion: (
    <>
      <circle cx="12" cy="4.8" r="1.8" />
      <path d="M11 8.5 8.5 13l2.5 1.5V20" />
      <path d="M13.5 8.5 16 12l-2 2.5" />
      <path d="M17.5 6.5a6 6 0 0 1 0 11M20 4a9.5 9.5 0 0 1 0 16" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-7 4.5-12.5 14-13 .5 8-4 14-11 14-1.5 0-3-1-3-1Z" />
      <path d="M8 16c2.5-3 5-5 8-6.5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6L12 3.2Z" />
      <path d="M4 7.6 12 12l8-4.4M12 12v8.8" />
    </>
  ),
  sofa: (
    <>
      <rect x="4" y="11" width="16" height="7" rx="2" />
      <path d="M7 11V8.5A2.5 2.5 0 0 1 9.5 6h5A2.5 2.5 0 0 1 17 8.5V11" />
      <path d="M4 14.5 2.5 15.5M20 14.5 21.5 15.5M6.5 18v2M17.5 18v2" />
    </>
  ),
  moon: (
    <>
      <path d="M19 14.5A8 8 0 0 1 9 5.2 8.4 8.4 0 1 0 19 14.5Z" />
      <path d="M15 4.5v3M13.5 6h3" />
    </>
  ),
  cup: (
    <>
      <path d="M5.5 8h11v6.5a4.5 4.5 0 0 1-4.5 4.5H10a4.5 4.5 0 0 1-4.5-4.5V8Z" />
      <path d="M16.5 9.5h2a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M8 4.5v1.5M12 4v2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 6v5.4c0 4.4-3 7.4-7 9.4-4-2-7-5-7-9.4V6l7-2.8Z" />
      <path d="m9 11.8 2.2 2.2 4-4.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.9" />
      <circle cx="15" cy="12" r="1.9" />
      <circle cx="7.5" cy="17" r="1.9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 8 8M16.5 16.5l2-2M14.5 14.5l2-2" />
    </>
  ),
  puzzle: (
    <>
      <path d="M4.5 9.5h3a2 2 0 1 0 4 0h3v3.5a2 2 0 1 1 0 4V20h-4a2 2 0 1 0-4 0h-2v-3.5a2 2 0 1 1 0-4V9.5Z" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5M20 14v6h-6M14 19h1.5v1.5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  trash: (
    <>
      <path d="M4.5 7h15M9 7V5h6v2" />
      <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L18 7" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  pen: (
    <>
      <path d="M4.5 19.5h3.5L19 8.5a2 2 0 0 0-2.8-2.8L5 17v2.5Z" />
      <path d="m15 7.5 2 2" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5" />
      <path d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9" />
      <path d="M20 4.5V9h-4.5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 15" />
      <path d="M4 19.5V15h4.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  wifi: (
    <>
      <path d="M3.5 9.5a13 13 0 0 1 17 0M6.5 13a8.5 8.5 0 0 1 11 0M9.5 16.3a4 4 0 0 1 5 0" />
      <circle cx="12" cy="19.4" r="0.9" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8l8.5-4.5Z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m7 9.5 2.5 2.5L7 14.5M12 15h5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.6 9l5.5 1.6-5.5 1.6L12 17.7l-1.6-5.5L4.9 10.6 10.4 9 12 3.5Z" />
      <path d="M18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h5.5v16H6a1.5 1.5 0 0 0-1.5 1.5v-16Z" />
      <path d="M19.5 5.5A1.5 1.5 0 0 0 18 4h-6.5v16H18a1.5 1.5 0 0 1 1.5 1.5v-16Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 21 19.5H3L12 3.8Z" />
      <path d="M12 9.5v4M12 16.6v.2" />
    </>
  ),
  list: (
    <>
      <path d="M8 6.5h12M8 12h12M8 17.5h12" />
      <circle cx="4.5" cy="6.5" r=".9" />
      <circle cx="4.5" cy="12" r=".9" />
      <circle cx="4.5" cy="17.5" r=".9" />
    </>
  ),
  play: <path d="M8 5.5 18.5 12 8 18.5V5.5Z" />,
  calendar: (
    <>
      <rect x="3.8" y="5" width="16.4" height="15" rx="2" />
      <path d="M3.8 9.5h16.4M8 3.5v3M16 3.5v3" />
    </>
  ),
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.6 0l2.4-2.4a4 4 0 0 0-5.6-5.6L11 7.5" />
      <path d="M14 10a4 4 0 0 0-5.6 0L6 12.4A4 4 0 0 0 11.6 18L13 16.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6" />
    </>
  ),
  cursor: (
    <>
      <path d="M6 4.5 18 12l-5 1.4L10 19 6 4.5Z" />
    </>
  ),
  plan: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M10 9.5v10M10 14.5h10.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="2.8" />
      <path d="M3.8 19c.5-3 2.7-4.6 5.2-4.6s4.7 1.6 5.2 4.6" />
      <path d="M15 6.2a2.6 2.6 0 0 1 0 5M16.5 14.6c2 .3 3.3 1.8 3.7 4.4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M7.5 15.5v-3M11 15.5V8.5M14.5 15.5v-5M18 15.5v-7.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 2 6.5h-15c.5-1 2-2.5 2-6.5Z" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </>
  ),
  screen: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.8" />
      <path d="M8 19.5h8M12 15.5v4" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
      <path d="M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h4M11 16.5h4" />
    </>
  )
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 18, className = '', strokeWidth = 1.5 }) {
  const node = ICONS[name] || ICONS.cube;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {node}
    </svg>
  );
}
