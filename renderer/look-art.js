'use strict';

// Drawings for Blip's looks (the flower pot lives in index.html). Each is a fixed SVG string:
// facing right, feet/wheels on the bottom edge, two eyes built by eye() so they blink and
// follow the mouse, and a .hit group that marks the parts you can click.
(function expose(root) {
  const svg = (id, w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" class="look" data-look="${id}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

  // Two of these per look. Optional outline makes stuck-on "googly" eyes stand out on paint and glass.
  function eye(x, y, rx, ry, r, { lid = '#fff', pupil = '#2b1a10', outline = null } = {}) {
    const shine = (r / 3).toFixed(2);
    const edge = outline ? ` stroke="${outline}" stroke-width="0.9"` : '';
    return `<g transform="translate(${x} ${y})"><g class="lid"><ellipse rx="${rx}" ry="${ry}" fill="${lid}"${edge}/>`
      + `<g class="pupil"><g class="pupil-scale"><circle r="${r}" fill="${pupil}"/>`
      + `<circle cx="${shine}" cy="${(-r / 2.4).toFixed(2)}" r="${shine}" fill="#fff"/></g></g></g></g>`;
  }

  // A spinning wheel: tyre, rim and five spokes, centred on (cx, cy).
  function wheel(cx, cy, rim, spoke, hub) {
    const spokes = [0, 72, 144, 216, 288].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return `M${cx} ${cy} L${(cx + 6.6 * Math.sin(a)).toFixed(2)} ${(cy - 6.6 * Math.cos(a)).toFixed(2)}`;
    }).join(' ');
    return `<g class="wheel"><circle cx="${cx}" cy="${cy}" r="11" fill="#17181c"/><circle cx="${cx}" cy="${cy}" r="7.6" fill="${rim}"/>`
      + `<path d="${spokes}" stroke="${spoke}" stroke-width="1.7" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.2" fill="${hub}"/></g>`;
  }

  // The dark inside of a wheel arch, so the gap above each tyre isn't see-through.
  const arch = (cx, cy, fill) => `<path d="M${cx - 13} ${cy} A13 13 0 0 1 ${cx + 13} ${cy} Z" fill="${fill}"/>`;

  const speedLines = (colour) => `<g class="speed" stroke="${colour}" stroke-width="2" stroke-linecap="round">`
    + '<path d="M-4 22 H-18"/><path d="M-2 31 H-24"/><path d="M-6 39 H-16"/></g>';

  // Electric GT: long, low fastback, frozen-blue paint, light bar at the back. No badges.
  const gtEyes = { outline: '#2b3a44' };
  const gt = svg('gt', 136, 54, `
    <defs>
      <linearGradient id="gt-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcecf4"/><stop offset="0.45" stop-color="#9fc4d8"/><stop offset="1" stop-color="#5b87a0"/></linearGradient>
      <linearGradient id="gt-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5262"/><stop offset="1" stop-color="#18252e"/></linearGradient>
    </defs>
    ${speedLines('#9fc4d8')}
    <g class="hit">
      <g class="car-body">
        ${arch(33, 43, '#22313b')}${arch(108, 43, '#22313b')}
        <path d="M6 43 L5 35 Q5 29.5 11 28 Q30 16.5 60 13.5 Q73 12.5 81 14 Q92 18 100 25 Q118 26.5 128 30 Q133 32 132 37 L131 41 Q130 43 127 43 L122 43 A14 14 0 0 0 94 43 L47 43 A14 14 0 0 0 19 43 Z" fill="url(#gt-paint)"/>
        <path d="M30 27.5 Q44 19 62 17 Q74 16.2 80 17 Q89 20.5 94 26 Z" fill="url(#gt-glass)"/>
        <path d="M63.5 16.8 L63 26.6" stroke="#9fc4d8" stroke-width="2.2"/>
        <path d="M13 33 Q66 28 128 32" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.45"/>
        <path d="M64 29 L63 41" stroke="#47708a" stroke-width="0.8" opacity="0.7"/>
        <path d="M51 32.2 H57" stroke="#47708a" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
        <path d="M95 23.6 Q100 21.8 101.5 24.6 L96 25.6 Z" fill="#7ea6bd"/>
        <rect x="4.5" y="30" width="6.5" height="3" rx="1.5" fill="#e0263b"/>
        <path d="M125 28.8 Q130.5 29.5 132 32.2 L126.2 31.8 Z" fill="#fffbe8"/>
        <path d="M118 37.5 Q123.5 40.2 129 37.2" stroke="#3d5d70" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        ${eye(70, 17, 4.6, 5.4, 2.5, gtEyes)}${eye(83, 17, 4.6, 5.4, 2.5, gtEyes)}
      </g>
      ${wheel(33, 43, '#c9d1d7', '#7b8891', '#56636c')}${wheel(108, 43, '#c9d1d7', '#7b8891', '#56636c')}
    </g>`);

  // Red supercar: wedge nose, cab-forward canopy, side intake, little spoiler. No badges.
  const supercarEyes = { outline: '#2b0f0f' };
  const supercar = svg('supercar', 134, 52, `
    <defs>
      <linearGradient id="supercar-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a3d"/><stop offset="0.5" stop-color="#d40000"/><stop offset="1" stop-color="#8c0000"/></linearGradient>
      <linearGradient id="supercar-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f47"/><stop offset="1" stop-color="#15181d"/></linearGradient>
    </defs>
    ${speedLines('#ff8a7a')}
    <g class="puffs" fill="#c9c9c9"><circle cx="-3" cy="36" r="2.5"/><circle cx="-10" cy="33.5" r="3.4"/><circle cx="-18" cy="31" r="4.3"/></g>
    <g class="hit">
      <g class="car-body">
        ${arch(30, 41, '#2a0505')}${arch(106, 41, '#2a0505')}
        <path d="M5 41 L4 32 Q4 27.5 9 27 L24 24 Q36 22.5 46 17.5 Q58 11 72 11 Q82 11.5 90 19 Q110 23 124 29 Q129 31 128 35.5 L127 39 Q126 41 123 41 L120 41 A14 14 0 0 0 92 41 L44 41 A14 14 0 0 0 16 41 Z" fill="url(#supercar-paint)"/>
        <path d="M44 21.5 Q55 13.8 68 13.4 Q79 13.7 85.5 20 Q66 20.8 44 21.5 Z" fill="url(#supercar-glass)"/>
        <path d="M30 31 Q42 28 54 29 Q50 33.5 46 35.5 Q38 36 30 34.5 Z" fill="#6e0000"/>
        <path d="M31 30.6 Q42 27.9 53 28.9" stroke="#ff7a6e" stroke-width="0.9" fill="none" opacity="0.8"/>
        <path d="M12 31 Q66 25.5 124 31" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.45"/>
        <path d="M3 27 L15 25 L15 27.4 L4 29 Z" fill="#2a0a0a"/>
        <path d="M25 23.6 L28 23 M30 22.6 L33 21.8 M34.6 21 L37.4 19.8" stroke="#5a0000" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="6.4" cy="31" r="2.2" fill="#ff7a3d"/>
        <path d="M120 26.5 Q126 28 128 31 L121 30 Z" fill="#fff6d8"/>
        <path d="M117 35.5 Q122 38.2 127 35.5" stroke="#5a0000" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        ${eye(64, 15.5, 4.4, 5.2, 2.4, supercarEyes)}${eye(77, 15.5, 4.4, 5.2, 2.4, supercarEyes)}
      </g>
      ${wheel(30, 41, '#3b3c42', '#d8d9de', '#9a9ba3')}${wheel(106, 41, '#3b3c42', '#d8d9de', '#9a9ba3')}
      <rect x="32" y="34.6" width="4.2" height="3.4" rx="1.2" fill="#ffd400"/><rect x="108" y="34.6" width="4.2" height="3.4" rx="1.2" fill="#ffd400"/>
    </g>`);

  const blush = (x, y, rx = 3, ry = 1.7) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ff5f7e" opacity="0.35"/>`;

  // Robot: screen face, blinking antenna, chest lights.
  const robotEyes = { lid: '#c8f8ff', pupil: '#0b3b4a' };
  const robot = svg('robot', 76, 100, `
    <defs><linearGradient id="robot-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2e9ef"/><stop offset="1" stop-color="#9fb0c0"/></linearGradient></defs>
    <g class="hit">
      <path d="M38 14 V6" stroke="#7d8d9c" stroke-width="2.4" stroke-linecap="round"/>
      <circle class="antenna-light" cx="38" cy="5" r="3.8" fill="#ff5a4f"/>
      <rect x="9" y="27" width="6" height="12" rx="2" fill="#7d8d9c"/><rect x="61" y="27" width="6" height="12" rx="2" fill="#7d8d9c"/>
      <rect x="13" y="13" width="50" height="38" rx="11" fill="url(#robot-metal)"/>
      <rect x="19" y="19" width="38" height="26" rx="8" fill="#1d2935"/>
      ${eye(30, 31, 5.2, 6, 3, robotEyes)}${eye(46, 31, 5.2, 6, 3, robotEyes)}
      <path d="M33 40.5 Q38 43.5 43 40.5" stroke="#7ee8f5" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <rect x="32" y="50" width="12" height="6" fill="#7d8d9c"/>
      <rect x="9" y="58" width="8" height="22" rx="4" fill="#9fb0c0"/><rect x="59" y="58" width="8" height="22" rx="4" fill="#9fb0c0"/>
      <rect x="17" y="55" width="42" height="31" rx="8" fill="url(#robot-metal)"/>
      <rect x="25" y="62" width="26" height="15" rx="4" fill="#2b3a48"/>
      <circle cx="31" cy="69.5" r="2.6" fill="#ff5a4f"/><circle class="chest-light" cx="38" cy="69.5" r="2.6" fill="#ffd23f"/><circle cx="45" cy="69.5" r="2.6" fill="#5be37d"/>
      <rect x="25" y="85" width="9" height="9" fill="#7d8d9c"/><rect x="42" y="85" width="9" height="9" fill="#7d8d9c"/>
      <rect x="21" y="93" width="16" height="7" rx="3.5" fill="#5f6f7e"/><rect x="39" y="93" width="16" height="7" rx="3.5" fill="#5f6f7e"/>
    </g>`);

  // UFO: a little alien under a glass dome, rim lights, a soft beam.
  const ufo = svg('ufo', 100, 88, `
    <defs>
      <linearGradient id="ufo-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f4f7"/><stop offset="1" stop-color="#8e9aa6"/></linearGradient>
      <linearGradient id="ufo-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ff7ff" stop-opacity="0.5"/><stop offset="1" stop-color="#9ff7ff" stop-opacity="0"/></linearGradient>
    </defs>
    <path class="beam" d="M38 52 L62 52 L76 88 L24 88 Z" fill="url(#ufo-beam)"/>
    <g class="hit">
      <ellipse cx="50" cy="44" rx="47" ry="11" fill="url(#ufo-metal)"/>
      <ellipse cx="50" cy="40.5" rx="30" ry="5.5" fill="#c3ccd5"/>
      <path d="M45 20 L42 12 M55 20 L58 12" stroke="#6cbf45" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="42" cy="11" r="2.2" fill="#a6e86f"/><circle cx="58" cy="11" r="2.2" fill="#a6e86f"/>
      <ellipse cx="50" cy="29" rx="12" ry="11" fill="#8fd45f"/>
      ${eye(45, 27.5, 3.8, 4.6, 2.2)}${eye(55, 27.5, 3.8, 4.6, 2.2)}
      <path d="M47 34 Q50 36.2 53 34" stroke="#3d6b24" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M29 40 Q29 15 50 15 Q71 15 71 40 Z" fill="#bfefff" opacity="0.35" stroke="#e9fbff" stroke-width="1.2"/>
      <path d="M35 31 Q37 21.5 45 18.5" stroke="#fff" stroke-width="2" fill="none" opacity="0.8" stroke-linecap="round"/>
      <g class="ufo-lights"><circle cx="16" cy="46" r="2.6" fill="#ffd23f"/><circle cx="33" cy="49" r="2.6" fill="#ff6fb1"/><circle cx="50" cy="50" r="2.6" fill="#7df3ff"/><circle cx="67" cy="49" r="2.6" fill="#ff6fb1"/><circle cx="84" cy="46" r="2.6" fill="#ffd23f"/></g>
      <ellipse cx="50" cy="53.5" rx="16" ry="3.4" fill="#9ff7ff" opacity="0.7"/>
    </g>`);

  // Rocket: hovering on a flickering flame.
  const rocket = svg('rocket', 64, 112, `
    <defs><linearGradient id="rocket-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d3dd"/></linearGradient></defs>
    <g class="flame"><path d="M23 80 Q32 112 41 80 Z" fill="#ff8b25"/><path d="M27 80 Q32 100 37 80 Z" fill="#ffe066"/></g>
    <g class="hit">
      <path d="M17 58 L4 80 L18 77 Z" fill="#e8443a"/><path d="M47 58 L60 80 L46 77 Z" fill="#e8443a"/>
      <path d="M32 5 Q49 22 48 54 L47 78 L17 78 L16 54 Q15 22 32 5 Z" fill="url(#rocket-body)"/>
      <path d="M32 5 Q42 14 45.5 27 L18.5 27 Q22 14 32 5 Z" fill="#e8443a"/>
      <rect x="16.6" y="62" width="30.8" height="5" fill="#3f7fd9"/>
      <path d="M21 78 L43 78 L40 84 L24 84 Z" fill="#59626b"/>
      ${eye(25, 42, 5, 6, 2.9)}${eye(39, 42, 5, 6, 2.9)}
      <path d="M28 51 Q32 54 36 51" stroke="#5a220c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${blush(20.5, 50, 2.8, 1.6)}${blush(43.5, 50, 2.8, 1.6)}
    </g>`);

  // Penguin: tuxedo, orange beak and feet.
  const penguin = svg('penguin', 70, 96, `
    <g class="hit">
      <path d="M11 44 Q1 60 6 72 Q13 62 15 50 Z" fill="#232c38"/><path d="M59 44 Q69 60 64 72 Q57 62 55 50 Z" fill="#232c38"/>
      <ellipse cx="26" cy="91" rx="9" ry="4" fill="#f7a21b"/><ellipse cx="44" cy="91" rx="9" ry="4" fill="#f7a21b"/>
      <path d="M35 6 Q61 6 61 48 Q61 88 35 88 Q9 88 9 48 Q9 6 35 6 Z" fill="#232c38"/>
      <path d="M35 22 Q52 22 53 38 Q56 56 52 72 Q47 85 35 85 Q23 85 18 72 Q14 56 17 38 Q18 22 35 22 Z" fill="#fbfaf7"/>
      ${eye(28, 36, 5.2, 6.2, 3)}${eye(42, 36, 5.2, 6.2, 3)}
      <path d="M30 44 L40 44 Q37 50 35 50 Q33 50 30 44 Z" fill="#f7a21b"/>
      ${blush(21.5, 46)}${blush(48.5, 46)}
    </g>`);

  // Dino: a chubby little green one with orange spikes.
  const dino = svg('dino', 96, 92, `
    <g class="hit">
      <path d="M32 56 Q14 60 3 72 Q18 73 36 68 Z" fill="#4fb35f"/>
      <path d="M25 52 L28 43 L33 48.5 L37 39.5 L42 45 L47 37.5 L51 44 Z" fill="#f7a21b"/>
      <rect x="30" y="72" width="12" height="19" rx="5" fill="#4fb35f"/><rect x="49" y="72" width="12" height="19" rx="5" fill="#4fb35f"/>
      <ellipse cx="46" cy="62" rx="22" ry="19" fill="#5cc46d"/>
      <ellipse cx="51" cy="67" rx="12" ry="11" fill="#c9f2a8"/>
      <path d="M48 54 Q46 32 57 22 Q66 14 78 15 Q93 17 93 31 Q93 45 78 45.5 Q68 46 64 56 Z" fill="#5cc46d"/>
      <path d="M64 63 Q71 63.5 72.5 68.5" stroke="#4fb35f" stroke-width="4" stroke-linecap="round" fill="none"/>
      ${eye(70, 27, 4.6, 5.4, 2.7)}${eye(82, 26, 4.6, 5.4, 2.7)}
      <circle cx="90" cy="30" r="1.1" fill="#2f6b38"/>
      <path d="M74 37.5 Q82 41.5 89.5 36.5" stroke="#2f6b38" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${blush(69, 35.5)}
    </g>`);

  // Cat: orange tabby with a swishing tail.
  const catEyes = { pupil: '#26331a' };
  const cat = svg('cat', 88, 84, `
    <g class="hit">
      <path class="tail" d="M20 58 Q4 54 6 38 Q8 28 15 30" stroke="#f2a144" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="20" y="62" width="9" height="18" rx="4.5" fill="#e0882f"/><rect x="31" y="62" width="9" height="18" rx="4.5" fill="#f2a144"/>
      <rect x="49" y="62" width="9" height="18" rx="4.5" fill="#e0882f"/><rect x="60" y="62" width="9" height="18" rx="4.5" fill="#f2a144"/>
      <ellipse cx="42" cy="58" rx="27" ry="15" fill="#f2a144"/>
      <path d="M30 45 Q33 52 30 58 M40 43.5 Q43 51 40 58 M50 44 Q53 51 50 57" stroke="#d97f25" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M52 25 L55 8 L66 19 Z" fill="#f2a144"/><path d="M70 19 L80 8 L83 25 Z" fill="#f2a144"/>
      <path d="M55.5 21 L57 12.5 L62.5 19 Z" fill="#ffb3c1"/><path d="M73.5 19.5 L79 12.5 L80.5 22 Z" fill="#ffb3c1"/>
      <circle cx="67" cy="34" r="18" fill="#f2a144"/>
      <path d="M64 17.5 V22 M68 16.5 V21.5 M72 17.5 V22" stroke="#d97f25" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="68" cy="41.5" rx="9" ry="6" fill="#ffe7c4"/>
      ${eye(61, 32, 4.4, 5.4, 2.7, catEyes)}${eye(74, 32, 4.4, 5.4, 2.7, catEyes)}
      <path d="M66 38.5 L70 38.5 L68 41 Z" fill="#ff8fa3"/>
      <path d="M68 41 Q66.5 44 64 43 M68 41 Q69.5 44 72 43" stroke="#7a3d12" stroke-width="1.1" fill="none" stroke-linecap="round"/>
      <path d="M59 41 L49 39 M59 43 L49 44 M77 41 L87 39 M77 43 L87 44" stroke="#7a3d12" stroke-width="0.8" opacity="0.6"/>
    </g>`);

  // Ghost: the friendly kind.
  const ghostEyes = { lid: '#2b2440', pupil: '#ffffff' };
  const ghost = svg('ghost', 72, 96, `
    <defs><linearGradient id="ghost-sheet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcd5f2"/></linearGradient></defs>
    <g class="hit">
      <path d="M36 6 Q63 6 63 40 L63 76 Q58.5 84 54 77 Q49.5 70 45 77 Q40.5 84 36 77 Q31.5 70 27 77 Q22.5 84 18 77 Q13.5 70 9 76 L9 40 Q9 6 36 6 Z" fill="url(#ghost-sheet)" stroke="#cfc6ea" stroke-width="1"/>
      <path d="M9 47 Q1 49 2.5 56 Q7 55 9.5 53 Z" fill="#f3f0fb"/><path d="M63 47 Q71 49 69.5 56 Q65 55 62.5 53 Z" fill="#e4def5"/>
      ${eye(27, 37, 5, 6.4, 2, ghostEyes)}${eye(45, 37, 5, 6.4, 2, ghostEyes)}
      <ellipse cx="36" cy="51" rx="3.6" ry="4.6" fill="#2b2440"/>
      ${blush(20.5, 47.5)}${blush(51.5, 47.5)}
    </g>`);

  // Rubber duck: yellow, orange beak, ready to hear about your bug.
  const duck = svg('duck', 84, 80, `
    <defs><linearGradient id="duck-yellow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#f5bf18"/></linearGradient></defs>
    <g class="hit">
      <path d="M8 46 Q4 36 10 34 Q16 44 30 46 Q46 42 62 46 Q78 52 74 66 Q70 78 44 78 Q16 78 10 64 Q8 56 8 46 Z" fill="url(#duck-yellow)"/>
      <path d="M24 56 Q38 48 50 56 Q44 66 30 64 Q24 62 24 56 Z" fill="#efb10e"/>
      <circle cx="56" cy="30" r="17" fill="url(#duck-yellow)"/>
      <path d="M70 30 Q84 29 82 35 Q80 40 70 39 Q66 36 70 30 Z" fill="#ff8b25"/>
      <path d="M70.5 35 Q76 35.6 81.5 35" stroke="#d96a0e" stroke-width="1" fill="none"/>
      ${eye(52, 26, 4.2, 5.2, 2.6)}${eye(63, 26, 4.2, 5.2, 2.6)}
      ${blush(50, 36, 3.2, 1.8)}
    </g>`);

  const art = { gt, supercar, robot, ufo, rocket, penguin, dino, cat, ghost, duck };
  if (typeof module !== 'undefined' && module.exports) module.exports = art;
  else root.LookArt = art;
})(typeof window !== 'undefined' ? window : globalThis);
