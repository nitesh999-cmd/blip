'use strict';

// Where Blip's window goes. Pure: displays are plain { bounds, workArea, id } objects.

const STRIP_HEIGHT = 380;
const PET_W = 84;
const PET_H = 124;
const FLOOR = 4;
const DRAG_PAD = 8;

const contains = (rect, point) => point.x >= rect.x && point.x < rect.x + rect.width
  && point.y >= rect.y && point.y < rect.y + rect.height;

/** A see-through strip along the bottom of a display's work area (above its taskbar). */
function stripBoundsFor(display, height = STRIP_HEIGHT) {
  const { workArea } = display;
  const h = Math.min(height, workArea.height);
  return { x: workArea.x, y: workArea.y + workArea.height - h, width: workArea.width, height: h };
}

/** The current look's drawing size; the flower pot's if the size given is missing or bad. */
function petSize(size) {
  const ok = (v) => Number.isFinite(v) && v > 0;
  return size && ok(size.w) && ok(size.h) ? { w: size.w, h: size.h } : { w: PET_W, h: PET_H };
}

/** While dragging, a pet-sized window that keeps the grabbed spot under the cursor. */
function dragBounds(cursor, grab, size) {
  const { w, h } = petSize(size);
  return {
    x: Math.round(cursor.x - grab.x - DRAG_PAD),
    y: Math.round(cursor.y - grab.y - DRAG_PAD),
    width: w + 2 * DRAG_PAD,
    height: h + DRAG_PAD + FLOOR,
  };
}

/** The display to live on: the saved one if it is still connected, otherwise the primary. */
function pickDisplay(displays, savedPoint, primary) {
  if (savedPoint && Number.isFinite(savedPoint.x) && Number.isFinite(savedPoint.y)) {
    const saved = displays.find((d) => contains(d.bounds, savedPoint));
    if (saved) return saved;
  }
  return primary;
}

/** A point that identifies a display across restarts: its centre. */
function displayPoint(display) {
  const { x, y, width, height } = display.bounds;
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
}

/** Where the pet lands inside the new strip: under the cursor, kept fully on screen. */
function dropX(cursor, grab, strip, width = PET_W) {
  const x = cursor.x - grab.x - strip.x;
  return Math.round(Math.min(Math.max(x, 0), Math.max(0, strip.width - petSize({ w: width, h: 1 }).w)));
}

/** Grab offsets come from the page; keep them inside the pet so a bad value can't fling the window. */
function safeGrab(grab, size) {
  const { w, h } = petSize(size);
  const clamp = (v, max) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : max / 2);
  return { x: clamp(grab && grab.x, w), y: clamp(grab && grab.y, h) };
}

module.exports = { stripBoundsFor, petSize, dragBounds, pickDisplay, displayPoint, dropX, safeGrab, STRIP_HEIGHT, DRAG_PAD, PET_W, PET_H };
