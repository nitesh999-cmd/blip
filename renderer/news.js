'use strict';

// The news dot's page. Everything shown is set with textContent; links never reach this page
// (a story is just a key; the main process opens the link after checking it).

(() => {
  const api = window.newsApi;
  const body = document.body;
  const dot = document.getElementById('dot');
  const card = document.getElementById('card');
  const kind = document.getElementById('kind');
  const note = document.getElementById('note');
  const list = document.getElementById('stories');
  const closeButton = document.getElementById('close');

  const DRAG_THRESHOLD = 4;
  const FIND_MS = 3500;
  const CORNERS = ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br'];

  let press = null;
  let dragging = false;
  let timer = null;
  let remaining = 0;
  let deadline = 0;
  let pendingTimeout = 0;
  let hasStories = false;
  let mode = 'rest';
  let findTimer = null;

  // ---------- modes: rest, working, waiting, find ----------
  function showMode(next) {
    body.dataset.mode = next;
  }

  api.onMode((next) => {
    if (next === 'find') {
      clearTimeout(findTimer);
      showMode('find');
      findTimer = setTimeout(() => showMode(mode), FIND_MS);
      return;
    }
    mode = ['rest', 'working', 'waiting'].includes(next) ? next : 'rest';
    showMode(mode);
  });

  // ---------- the message ----------
  function setCorner(corner) {
    body.classList.remove(...CORNERS);
    if (corner) body.classList.add(`corner-${corner}`);
  }

  function storyItem(story) {
    const item = document.createElement('li');
    item.className = 'story';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'title';
    title.textContent = story.title;
    title.addEventListener('click', () => api.read(story.key));
    const meta = document.createElement('div');
    meta.className = 'meta';
    const source = document.createElement('span');
    source.textContent = story.source;
    const read = document.createElement('button');
    read.type = 'button';
    read.className = 'read';
    read.textContent = 'Read';
    read.addEventListener('click', () => api.read(story.key));
    meta.append(source, read);
    item.append(title, meta);
    return item;
  }

  function render(view) {
    const stories = Array.isArray(view.stories) ? view.stories : [];
    kind.textContent = String(view.heading || 'News');
    card.classList.toggle('urgent', view.urgent === true);
    note.textContent = String(view.note || '');
    note.hidden = !view.note;
    list.replaceChildren(...stories.map(storyItem));
    hasStories = stories.length > 0;
  }

  // The message closes by itself after a while; hovering it pauses the countdown.
  function runTimer() {
    clearTimeout(timer);
    deadline = Date.now() + remaining;
    timer = setTimeout(() => api.close(hasStories), remaining);
  }
  card.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    remaining = Math.max(2000, deadline - Date.now());
  });
  card.addEventListener('mouseleave', () => { if (body.classList.contains('visible')) runTimer(); });

  api.onOpen(({ view, corner }) => {
    clearTimeout(timer);
    body.classList.remove('visible');
    setCorner(corner);
    body.classList.add('open');
    render(view || {});
    pendingTimeout = Number.isFinite(view && view.timeoutMs) ? view.timeoutMs : 45000;
    requestAnimationFrame(() => api.reportHeight(card.offsetHeight + 24));
  });

  api.onShown(({ corner }) => {
    setCorner(corner);
    body.classList.add('visible');
    remaining = pendingTimeout;
    runTimer();
  });

  api.onCollapsed(() => {
    clearTimeout(timer);
    body.classList.remove('open', 'visible');
    setCorner(null);
  });

  closeButton.addEventListener('click', () => api.close(false));

  // ---------- tap, drag, right-click ----------
  dot.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = dot.getBoundingClientRect();
    press = { x: event.screenX, y: event.screenY, grab: { x: event.clientX - rect.left, y: event.clientY - rect.top } };
    dot.setPointerCapture(event.pointerId);
  });

  dot.addEventListener('pointermove', (event) => {
    if (!press || dragging) return;
    if (Math.hypot(event.screenX - press.x, event.screenY - press.y) > DRAG_THRESHOLD) {
      dragging = true;
      body.classList.add('dragging');
      api.dragStart(press.grab);
    }
  });

  function finishPress(tapped) {
    press = null;
    if (dragging) {
      dragging = false;
      body.classList.remove('dragging');
      api.dragEnd();
    } else if (tapped) {
      api.tap();
    }
  }

  dot.addEventListener('pointerup', (event) => {
    if (!press) return;
    if (dot.hasPointerCapture(event.pointerId)) dot.releasePointerCapture(event.pointerId);
    finishPress(true);
  });
  dot.addEventListener('pointercancel', () => finishPress(false));
  dot.addEventListener('lostpointercapture', () => { if (press) finishPress(false); });

  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    api.menu();
  });
})();
