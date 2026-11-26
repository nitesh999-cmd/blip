'use strict';

// Where the news dot's window goes. Pure: displays are plain { bounds, workArea, id } objects.
// A "point" is the centre of the dot in screen coordinates.

const DOT_BOX = 28;
const HALF = DOT_BOX / 2;
const EDGE = 40;
const OPEN_W = 320;
const MIN_OPEN_H = 80;
const MAX_OPEN_H = 420;

const inside = (area, point, margin = 0) => point.x >= area.x + margin && point.x < area.x + area.width - margin
  && point.y >= area.y + margin && point.y < area.y + area.height - margin;

/** Near the top-right corner of a display, out of the way. */
function defaultPoint(display) {
  const { workArea } = display;
  return { x: workArea.x + workArea.width - EDGE, y: workArea.y + EDGE };
}

/** The saved spot if it is still on a connected screen, otherwise the primary's top-right. */
function pickPoint(displays, saved, primary) {
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const home = displays.find((d) => inside(d.workArea, saved, HALF));
    if (home) return { x: saved.x, y: saved.y };
  }
  return defaultPoint(primary);
}

/** Keeps the whole dot box on the given work area. */
function clampPoint(point, workArea) {
  const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), hi));
  return {
    x: clamp(point.x, workArea.x + HALF, workArea.x + workArea.width - HALF),
    y: clamp(point.y, workArea.y + HALF, workArea.y + workArea.height - HALF),
  };
}

const dotBounds = (point) => ({ x: Math.round(point.x - HALF), y: Math.round(point.y - HALF), width: DOT_BOX, height: DOT_BOX });

/** Grab offsets come from the page; keep them inside the dot box. */
function safeGrab(grab) {
  const clamp = (v) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), DOT_BOX) : HALF);
  return { x: clamp(grab && grab.x), y: clamp(grab && grab.y) };
}

/** While dragging: the dot's centre, keeping the grabbed spot under the cursor. */
const dragPoint = (cursor, grab) => ({ x: cursor.x - grab.x + HALF, y: cursor.y - grab.y + HALF });

/**
 * The open message grows from the dot toward the middle of its screen, so it never runs
 * off an edge. corner says where the dot sits in the open window ("br" = bottom right).
 */
function openLayout(point, workArea, height) {
  const h = Math.round(Math.min(Math.max(Number.isFinite(height) ? height : MIN_OPEN_H, MIN_OPEN_H), Math.min(MAX_OPEN_H, workArea.height)));
  const right = point.x > workArea.x + workArea.width / 2;
  const bottom = point.y > workArea.y + workArea.height / 2;
  const rawX = right ? point.x + HALF - OPEN_W : point.x - HALF;
  const rawY = bottom ? point.y + HALF - h : point.y - HALF;
  const x = Math.round(Math.min(Math.max(rawX, workArea.x), workArea.x + workArea.width - OPEN_W));
  const y = Math.round(Math.min(Math.max(rawY, workArea.y), workArea.y + workArea.height - h));
  return { bounds: { x, y, width: OPEN_W, height: h }, corner: `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` };
}

module.exports = { defaultPoint, pickPoint, clampPoint, dotBounds, safeGrab, dragPoint, openLayout, DOT_BOX, OPEN_W };
