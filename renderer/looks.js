'use strict';

// Blip's looks: the flower pot plus ten others, picked from the right-click menu.
// Shared by the page (how each look moves) and main (menu, saved choice, drag size).
(function expose(root) {
  const DEFAULT_LOOK = 'sprout';

  // w/h: drawing size in px (matches its SVG). motion: waddle | drive | float.
  // faces: flips to face where it is going. oneWay: only ever moves left to right.
  // travel: how far the pupils move (1 = Sprout's big eyes). top: highest point, for the bubble.
  // shadow: shadow width as a share of w.
  const look = (fields) => Object.freeze({ speed: 1, faces: false, oneWay: false, travel: 1, shadow: 0.55, ...fields });

  const LOOKS = Object.freeze([
    look({ id: 'sprout', label: 'Sprout the flower pot', w: 84, h: 124, motion: 'waddle', top: 20, greeting: 'Back to being a flower pot. Roots feel good.' }),
    look({ id: 'gt', label: 'Electric GT (Taycan style)', w: 136, h: 54, motion: 'drive', speed: 2.2, faces: true, travel: 0.6, shadow: 0.84, top: 10, greeting: 'Electric GT mode: silent, smooth and very quick.' }),
    look({ id: 'supercar', label: 'Red supercar (Ferrari style)', w: 134, h: 52, motion: 'drive', speed: 3, oneWay: true, travel: 0.55, shadow: 0.84, top: 10, greeting: 'Vroom! Red supercar, left to right, flat out.' }),
    look({ id: 'robot', label: 'Robot', w: 76, h: 100, motion: 'waddle', speed: 0.9, travel: 0.7, shadow: 0.5, top: 1, greeting: 'Beep boop. Robot mode online.' }),
    look({ id: 'ufo', label: 'UFO', w: 100, h: 88, motion: 'float', speed: 1.4, travel: 0.5, shadow: 0.5, top: 8, greeting: 'Greetings, earthling. I come in peace.' }),
    look({ id: 'rocket', label: 'Rocket', w: 64, h: 112, motion: 'float', speed: 1.2, travel: 0.7, shadow: 0.55, top: 4, greeting: '3, 2, 1... hover! Rocket ready.' }),
    look({ id: 'penguin', label: 'Penguin', w: 70, h: 96, motion: 'waddle', speed: 0.8, travel: 0.7, shadow: 0.62, top: 6, greeting: 'Waddle waddle. Penguin reporting for duty.' }),
    look({ id: 'dino', label: 'Dino', w: 96, h: 92, motion: 'waddle', faces: true, travel: 0.6, shadow: 0.6, top: 15, greeting: 'Rawr! That means hello in dinosaur.' }),
    look({ id: 'cat', label: 'Cat', w: 88, h: 84, motion: 'waddle', speed: 1.1, faces: true, travel: 0.6, shadow: 0.66, top: 8, greeting: "Meow. I'll supervise your work from here." }),
    look({ id: 'ghost', label: 'Ghost', w: 72, h: 96, motion: 'float', travel: 0.9, shadow: 0.6, top: 6, greeting: "Boo! Don't worry, I'm the friendly kind." }),
    look({ id: 'duck', label: 'Rubber duck', w: 84, h: 80, motion: 'waddle', faces: true, travel: 0.6, shadow: 0.7, top: 13, greeting: 'Quack! Tell me your bug and I will listen.' }),
  ]);

  const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

  /** A saved or requested look id, or the pot if it isn't one we know. */
  function sanitizeLook(value) {
    return typeof value === 'string' && BY_ID.has(value) ? value : DEFAULT_LOOK;
  }

  function lookById(id) {
    return BY_ID.get(sanitizeLook(id));
  }

  /** A random look that isn't the current one. */
  function surpriseLook(current, random = Math.random) {
    const others = LOOKS.filter((l) => l.id !== current);
    const index = Math.min(others.length - 1, Math.floor(random() * others.length));
    return others[index].id;
  }

  /** The look after this one in menu order; after the last comes the pot again. */
  function nextLook(current) {
    const index = LOOKS.findIndex((l) => l.id === sanitizeLook(current));
    return LOOKS[(index + 1) % LOOKS.length].id;
  }

  const clampX = (x, w, viewW, edge) => Math.min(Math.max(x, edge), Math.max(edge, viewW - w - edge));
  const isOnScreen = (x, w, viewW) => x >= 0 && x + w <= viewW;

  /**
   * One step of walking or driving. Two-way looks turn round at the edges;
   * one-way looks keep going right, leave the screen and come back in from the left.
   */
  function stepX({ x, dir, dx, w, viewW, edge, oneWay }) {
    if (oneWay) {
      const next = x + dx;
      return { x: next > viewW ? -w : next, dir: 1 };
    }
    const maxX = Math.max(edge, viewW - w - edge);
    const next = x + dir * dx;
    if (next <= edge) return { x: edge, dir: 1 };
    if (next >= maxX) return { x: maxX, dir: -1 };
    return { x: next, dir };
  }

  /** The "Change my look" submenu as plain Electron menu items. */
  function menuTemplate(currentId, pick, surprise) {
    const current = sanitizeLook(currentId);
    return [
      { label: 'Surprise me', click: () => surprise() },
      { type: 'separator' },
      ...LOOKS.map((l) => ({ label: l.label, type: 'radio', checked: l.id === current, click: () => pick(l.id) })),
    ];
  }

  const api = { LOOKS, DEFAULT_LOOK, lookById, sanitizeLook, surpriseLook, nextLook, stepX, isOnScreen, clampX, menuTemplate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Looks = api;
})(typeof window !== 'undefined' ? window : globalThis);
