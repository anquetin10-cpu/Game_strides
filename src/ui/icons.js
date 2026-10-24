// Icônes SVG (trait, 24×24, currentColor). « strides » : le S-tête de cheval du logo officiel.
import { markSvg } from './logo.js';
const s = (body, fill = false) =>
  `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  strides: markSvg(),
  phone: s('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  horse: s('<path d="M5 20v-5.5c0-2 1-3.5 3-4.5l4-2 1.5-4 2 2 3 1.5-1 2.5-2.5-.5-1.5 2.5V20"/><path d="M12 13.5 9 20"/>'),
  jump: s('<path d="M3 18c3-9 15-9 18 0"/><path d="M8 18v2M16 18v2M6 20h12"/><path d="M17 8.5l2-1.5.5 2.5" />'),
  gallop: s('<path d="M3 8h7M2 12h9M4 16h6"/><path d="M14 7l6 5-6 5"/>'),
  run: s('<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5M6 12l3-4h5l2 4 3 1"/>'),
  whistle: s('<circle cx="9" cy="14" r="5"/><path d="M13 11l8-4v4l-6 2"/><path d="M9 14h.01"/>'),
  truck: s('<path d="M2 16V6h12v10M14 9h4l3 3.5V16h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
  down: s('<path d="M12 4v14M6 12l6 6 6-6"/>'),
  hand: s('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1-5.5-3L3.5 14.5a1.5 1.5 0 0 1 2.3-1.9L8 15"/>'),
  talk: s('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  star: s('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>', true),
  pin: s('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  map: s('<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  message: s('<path d="M4 5h16v11H9l-5 4z"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  trophy: s('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20.5h7M10 17h4l.5 3.5h-5z"/>'),
  camera: s('<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>'),
  home: s('<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>'),
  bag: s('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  event: s('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  stable: s('<path d="M3 10 12 4l9 6v10H3z"/><path d="M8 20v-6h8v6M12 14v6"/>'),
  pro: s('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>'),
  directory: s('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="2.6"/><path d="M8 17c.7-2 2.2-3 4-3s3.3 1 4 3"/>'),
  briefcase: s('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>'),
  view: s('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  weather: s('<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M9 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 9 19z"/>'),
  beach: s('<path d="M4 20h16M12 20 9 7"/><path d="M3 9c3-5 11-6 15-2-5-1-10 0-15 2z"/>'),
  town: s('<path d="M3 20V9l5-3v14M8 20V4h8v16M16 20v-9l5 2v7M3 20h18"/>'),
  shoe: s('<path d="M7 4c-2 2-3 5-3 8 0 4 3 8 8 8s8-4 8-8c0-3-1-6-3-8"/><path d="M7 4l2 2M17 4l-2 2"/>'),
  sound: s('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  external: s('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
  pause: s('<path d="M8 5v14M16 5v14"/>'),
  target: s('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
};

export const icon = (name) => ICONS[name] || '';
