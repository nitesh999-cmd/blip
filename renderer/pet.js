'use strict';

(() => {
  const { emptyQueue, pushBubble, finishBubble } = window.BubbleQueue;
  const { growthAt, plantShape } = window.Growth;

  const PET_W = 84;
  const SVG_H = 124;
  const SOIL_Y = 64;
  const POT_CENTRE_FROM_BOTTOM = 32;
  const BUBBLE_GAP = 10;
  const GROWTH_EVERY_MS = 30_000;
  const DEMO_GROWTH_EVERY_MS = 100;
  const DEMO_DAY_MS = 20_000;
  const DEMO_LOOP_MS = 24_000;
  const FLOOR = 4;
  const EDGE = 10;
  const WALK_SPEED = 38;
  const NOTICE_RADIUS = 210;
  const JUMP_MS = 720;
  const DRAG_THRESHOLD = 6;
  const DRAG_PAD = 8;
  const MIN_BUBBLE_MS = 2000;
  const MAX_BUBBLE_MS = 120_000;

  const pet = document.getElementById('pet');
  const bodyWrap = document.getElementById('body-wrap');
  const pupils = [...document.querySelectorAll('.pupil')];
  const pot = document.getElementById('pot');
  const plant = document.getElementById('plant');
  const stem = document.getElementById('stem');
  const leavesLow = document.getElementById('leaves-low');
  const leavesHigh = document.getElementById('leaves-high');
  const bud = document.getElementById('bud');
  const flower = document.getElementById('flower');
  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const bubbleSub = document.getElementById('bubble-sub');
  const bubbleBtn = document.getElementById('bubble-btn');

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  let x = rand(EDGE, Math.max(EDGE, innerWidth - PET_W - EDGE));
  let dir = Math.random() < 0.5 ? -1 : 1;
  let mode = 'walk';
  let modeUntil = performance.now() + rand(3000, 7000);
  let idleLook = { x: 0, y: 0 };
  let cursor = { x: -10_000, y: -10_000 };
  let noticed = false;
  let jumping = false;
  let dragging = false;
  let press = null;
  let moveQueued = false;
  let queue = emptyQueue();
  let bubbleTimer = null;
  let lastHitKey = '';
  let last = performance.now();
  let plantTop = SOIL_Y;
  let growthSource = () => growthAt(new Date());
  let growthTimer = null;

  // ---------- the plant grows with the time of day ----------
  function setPart(element, y, scale) {
    const size = Math.max(0.001, scale);
    element.setAttribute('transform', `translate(42 ${y.toFixed(1)}) scale(${size.toFixed(3)})`);
    element.style.opacity = scale > 0.01 ? '1' : '0';
  }

  function renderPlant() {
    const shape = plantShape(growthSource());
    const top = SOIL_Y - shape.stem;
    stem.setAttribute('d', `M42 ${SOIL_Y} Q44.5 ${(SOIL_Y - shape.stem / 2).toFixed(1)} 42 ${top.toFixed(1)}`);
    setPart(leavesLow, SOIL_Y - 3 - shape.stem * 0.45, shape.lowerLeaves);
    setPart(leavesHigh, SOIL_Y - shape.stem * 0.78, shape.upperLeaves);
    setPart(bud, top, shape.bud * (1 - shape.bloom));
    setPart(flower, top, shape.bloom);
    plantTop = top - 9 * Math.max(shape.bud, shape.bloom);
  }

  function startGrowing(everyMs) {
    clearInterval(growthTimer);
    renderPlant();
    growthTimer = setInterval(renderPlant, everyMs);
  }

  /** Demo mode: a whole day of growth in 20 seconds, then start again. */
  function startDemoGrowth() {
    const demoStart = performance.now();
    growthSource = () => ((performance.now() - demoStart) % DEMO_LOOP_MS) / DEMO_DAY_MS;
    startGrowing(DEMO_GROWTH_EVERY_MS);
  }

  // ---------- speech bubbles ----------
  function render(item) {
    clearTimeout(bubbleTimer);
    if (!item) {
      bubble.hidden = true;
      return;
    }
    bubble.hidden = false;
    bubble.dataset.priority = String(item.priority);
    bubble.classList.toggle('thinking', Boolean(item.thinking));
    bubble.classList.toggle('wide', Boolean(item.wide));
    bubbleText.textContent = item.thinking ? '' : String(item.text || '');
    bubbleSub.textContent = String(item.sub || '');
    bubbleSub.hidden = !item.sub;
    bubbleBtn.hidden = !item.actionId;
    bubbleBtn.textContent = item.actionId ? String(item.actionLabel || 'Open') : '';
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
    bubbleTimer = setTimeout(dismiss, clamp(Number(item.durationMs) || 5000, MIN_BUBBLE_MS, MAX_BUBBLE_MS));
  }

  function enqueue(item) {
    const result = pushBubble(queue, item);
    queue = result.state;
    if (result.show) render(result.show);
  }

  function dismiss() {
    const result = finishBubble(queue);
    queue = result.state;
    render(result.show);
  }

  bubble.addEventListener('click', dismiss);
  bubbleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const actionId = queue.current && queue.current.actionId;
    if (actionId) window.blip.bubbleAction(actionId);
    dismiss();
  });

  // ---------- jumping, blinking ----------
  function jump() {
    if (jumping) return;
    jumping = true;
    bubble.classList.add('hold');
    bodyWrap.classList.remove('jump');
    void bodyWrap.offsetWidth;
    bodyWrap.classList.add('jump');
    setTimeout(() => {
      jumping = false;
      bodyWrap.classList.remove('jump');
      bubble.classList.remove('hold');
      if (!bubble.hidden) {
        bubble.classList.remove('pop');
        void bubble.offsetWidth;
        bubble.classList.add('pop');
      }
    }, JUMP_MS);
  }

  function blinkLater() {
    setTimeout(() => {
      pet.classList.add('blink');
      setTimeout(() => pet.classList.remove('blink'), 130);
      blinkLater();
    }, rand(2500, 6000));
  }

  // ---------- tap vs drag ----------
  // A press that moves more than a few pixels picks Blip up; a press that doesn't is a tap.
  // Pointer capture keeps the events coming even when the mouse outruns the window.
  function beginDrag(grab) {
    dragging = true;
    pet.classList.add('dragging');
    bubble.classList.add('hold');
    window.blip.dragStart(grab);
  }

  function queueDragMove() {
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      if (dragging) window.blip.dragMove();
    });
  }

  pet.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = pet.getBoundingClientRect();
    press = { x: event.screenX, y: event.screenY, grab: { x: event.clientX - rect.left, y: event.clientY - rect.top } };
    pet.setPointerCapture(event.pointerId);
  });

  pet.addEventListener('pointermove', (event) => {
    if (!press) return;
    if (dragging) { queueDragMove(); return; }
    if (Math.hypot(event.screenX - press.x, event.screenY - press.y) > DRAG_THRESHOLD) beginDrag(press.grab);
  });

  pet.addEventListener('pointerup', (event) => {
    if (!press) return;
    press = null;
    if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
    if (dragging) {
      window.blip.dragEnd();
      return;
    }
    jump();
    window.blip.tap();
  });

  // If Windows ever takes the mouse away mid-drag, drop Blip where it is rather than
  // leaving it stuck to the cursor. Main ignores a second drop.
  const abandonPress = () => {
    press = null;
    if (dragging) window.blip.dragEnd();
  };
  pet.addEventListener('pointercancel', abandonPress);
  pet.addEventListener('lostpointercapture', abandonPress);

  window.blip.onDragMode(() => { x = DRAG_PAD; });
  window.blip.onPlaced((place) => {
    x = Number.isFinite(place && place.x) ? place.x : x;
    dragging = false;
    pet.classList.remove('dragging');
    bubble.classList.remove('hold');
    mode = 'idle';
    modeUntil = performance.now() + 2500;
  });
  pet.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.blip.openMenu();
  });

  // ---------- walking and looking ----------
  function chooseNextMode(now) {
    if (mode === 'walk') {
      mode = 'idle';
      modeUntil = now + rand(1500, 4500);
      idleLook = { x: rand(-0.6, 0.6), y: rand(-0.4, 0.3) };
    } else {
      mode = 'walk';
      modeUntil = now + rand(3000, 8000);
      if (Math.random() < 0.4) dir = -dir;
    }
  }

  function walk(dt) {
    const minX = EDGE;
    const maxX = Math.max(EDGE, innerWidth - PET_W - EDGE);
    x += dir * WALK_SPEED * dt;
    if (x <= minX || x >= maxX) {
      x = clamp(x, minX, maxX);
      dir = -dir;
    }
  }

  function lookDirection(dx, dy, dist, walking) {
    if (noticed) return { x: dx / (dist || 1), y: dy / (dist || 1) };
    if (walking) return { x: dir * 0.7, y: 0.1 };
    return idleLook;
  }

  function placeBubble() {
    if (bubble.hidden) return;
    const width = bubble.offsetWidth;
    const centre = x + PET_W / 2;
    const left = clamp(centre - width / 2, 8, Math.max(8, innerWidth - width - 8));
    bubble.style.left = `${left}px`;
    bubble.style.bottom = `${Math.round(FLOOR + (SVG_H - plantTop) + BUBBLE_GAP)}px`;
    bubble.style.setProperty('--tail-x', `${clamp(centre - left, 18, width - 18)}px`);
  }

  function reportHitRects() {
    const rects = [pot.getBoundingClientRect(), plant.getBoundingClientRect()];
    if (!bubble.hidden) rects.push(bubble.getBoundingClientRect());
    const plain = rects.map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }));
    const key = plain.map((r) => [r.x, r.y, r.w, r.h].map((n) => n >> 2).join(',')).join('|');
    if (key === lastHitKey) return;
    lastHitKey = key;
    window.blip.setHitRects(plain);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const centreX = x + PET_W / 2;
    const centreY = innerHeight - FLOOR - POT_CENTRE_FROM_BOTTOM;
    const dx = cursor.x - centreX;
    const dy = cursor.y - centreY;
    const dist = Math.hypot(dx, dy);
    noticed = dist < NOTICE_RADIUS;

    const holding = dragging || noticed || jumping || Boolean(queue.current);
    if (!holding && now > modeUntil) chooseNextMode(now);
    const walking = !holding && mode === 'walk';
    if (walking) walk(dt);

    pet.classList.toggle('walking', walking);
    pet.classList.toggle('noticed', noticed);
    pet.style.transform = `translateX(${x}px)`;

    const look = lookDirection(dx, dy, dist, walking);
    const transform = `translate(${(look.x * 3.1).toFixed(2)} ${(look.y * 3.8).toFixed(2)})`;
    pupils.forEach((pupil) => pupil.setAttribute('transform', transform));

    placeBubble();
    reportHitRects();
    requestAnimationFrame(frame);
  }

  window.blip.onCursor((point) => { cursor = point; });
  window.blip.onBubble(enqueue);
  window.blip.onJump(jump);
  window.blip.onDemo(startDemoGrowth);

  startGrowing(GROWTH_EVERY_MS);
  blinkLater();
  requestAnimationFrame(frame);
})();
