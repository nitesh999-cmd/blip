'use strict';

// One speech bubble at a time. Meetings outrank email, email outranks chatter.
// Pure functions over { current, waiting }; loaded by the renderer and by the tests.
(function expose(root) {
  const PRIORITY = Object.freeze({ chatter: 1, email: 2, meeting: 3, notice: 2 });

  const emptyQueue = () => ({ current: null, waiting: [] });

  function byPriority(bubbles) {
    return [...bubbles].sort((a, b) => b.priority - a.priority);
  }

  /** @returns {{ state: object, show: object|null }} */
  function pushBubble(state, bubble) {
    const { current, waiting } = state;
    if (!current) return { state: { current: bubble, waiting }, show: bubble };

    const chatterSwap = bubble.priority === PRIORITY.chatter && current.priority === PRIORITY.chatter;
    if (bubble.priority > current.priority || chatterSwap) {
      const keep = current.priority > PRIORITY.chatter ? [current, ...waiting] : waiting;
      return { state: { current: bubble, waiting: byPriority(keep) }, show: bubble };
    }
    if (bubble.priority === PRIORITY.chatter) return { state, show: null };
    return { state: { current, waiting: byPriority([...waiting, bubble]) }, show: null };
  }

  /** The current bubble finished or was dismissed: show the next waiting one. */
  function finishBubble(state) {
    const [next = null, ...rest] = state.waiting;
    return { state: { current: next, waiting: rest }, show: next };
  }

  const api = { PRIORITY, emptyQueue, pushBubble, finishBubble };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BubbleQueue = api;
})(typeof window !== 'undefined' ? window : globalThis);
