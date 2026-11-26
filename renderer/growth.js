'use strict';

// How grown Sprout's plant is, from the local clock: a tiny shoot at 6 am,
// full bloom at 6 pm, kept through the evening, back to a shoot after midnight.
(function expose(root) {
  const GROW_START_MIN = 6 * 60;
  const GROW_END_MIN = 18 * 60;
  const MIN_STEM = 6;
  const MAX_STEM_GAIN = 40;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const ramp = (g, from, to) => clamp01((g - from) / (to - from));

  /** 0 = fresh shoot, 1 = full bloom. */
  function growthAt(date) {
    const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    return clamp01((minutes - GROW_START_MIN) / (GROW_END_MIN - GROW_START_MIN));
  }

  /** Sizes for each part of the plant; scales are 0..1. */
  function plantShape(growth) {
    const g = clamp01(growth);
    return {
      stem: MIN_STEM + MAX_STEM_GAIN * ramp(g, 0, 0.6),
      lowerLeaves: ramp(g, 0.05, 0.3),
      upperLeaves: ramp(g, 0.35, 0.6),
      bud: ramp(g, 0.6, 0.8),
      bloom: ramp(g, 0.8, 1),
    };
  }

  const api = { growthAt, plantShape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Growth = api;
})(typeof window !== 'undefined' ? window : globalThis);
