// Outline icons for buttons: white line drawings (currentColor), never colour emoji.
// svg('bulb') → an <svg> string. Add a new one here instead of typing an emoji.
const P = {
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2.2h5c0-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  turn: '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/>',
  sneak: '<path d="M12 4v12M7 11.5l5 5 5-5M5 20h14"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  fly: '<path d="M2 8c4 0 7 2 10 6 3-4 6-6 10-6M12 14v6"/>',
  bino: '<circle cx="7" cy="16" r="4"/><circle cx="17" cy="16" r="4"/><path d="M7 12V6h3v6M17 12V6h-3v6M11 16h2"/>',
  wiper: '<path d="M3 18a14 14 0 0 1 18 0M12 18 18 7"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  door: '<path d="M6 21V3h11v18M3 21h18M13 12h1"/>',
  drone: '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><path d="M8.5 7h7M12 7v6M9 13h6v4H9z"/>',
  camera: '<path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13.5" r="3.3"/>',
  wrench: '<path d="M14 6a4 4 0 0 0 5 5l-9.5 9.5a2.1 2.1 0 0 1-3-3L16 8"/>',
  horn: '<path d="M4 10v4h3l8 4V6l-8 4H4zM18 9.5a3.5 3.5 0 0 1 0 5"/>',
  weather: '<path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-1 6H7zM9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
};
export const svg = (n) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
