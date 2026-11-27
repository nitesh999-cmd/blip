'use strict';

// Verification run, not part of Blip: pictures of each look taken from Blip's own window
// (never the screen), plus logs showing the supercar driving off the right edge and back in
// from the left, and the GT turning to face the way it drives.
// Uses a throwaway data folder, so the owner's saved settings and running Blip are untouched.
//   BLIP_CAPTURE_DIR=<dir> [BLIP_LOOKS=gt,supercar] node_modules/.bin/electron test/visual/capture-looks.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'blip-looks-')));
const outDir = process.env.BLIP_CAPTURE_DIR;
const only = process.env.BLIP_LOOKS ? process.env.BLIP_LOOKS.split(',') : null;
const zoom = Number(process.env.BLIP_ZOOM) || 1; // >1 for close-up pictures only (skips the motion checks)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATE_JS = `(() => {
  const pet = document.getElementById('pet');
  const svg = document.querySelector('svg.look.active');
  const r = pet.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: r.width, h: r.height,
    look: pet.dataset.look, flip: svg.style.transform || 'none', walking: pet.classList.contains('walking'), viewW: innerWidth };
})()`;

async function snap(pet, file, pad = { side: 90, above: 110 }) {
  const s = await pet.win.webContents.executeJavaScript(STATE_JS);
  const area = {
    x: Math.round(Math.max(0, s.x - pad.side) * zoom),
    y: Math.round(Math.max(0, s.y - pad.above) * zoom),
    width: Math.round((s.w + 2 * pad.side) * zoom),
    height: Math.round((s.h + pad.above + 6) * zoom),
  };
  const image = await pet.win.webContents.capturePage(area);
  fs.writeFileSync(path.join(outDir, file), image.toPNG());
  return s;
}

async function track(pet, ms, every = 200) {
  const samples = [];
  for (let t = 0; t < ms; t += every) {
    samples.push(await pet.win.webContents.executeJavaScript(STATE_JS));
    await wait(every);
  }
  return samples;
}

async function run() {
  const { createPetWindow } = require('../../src/pet-window');
  const { LOOKS, lookById } = require('../../renderer/looks');
  const pet = createPetWindow();
  await new Promise((resolve) => pet.win.webContents.once('did-finish-load', resolve));
  if (zoom > 1) pet.win.webContents.setZoomFactor(zoom);
  await wait(800);

  const setLook = (id) => { pet.setSize(lookById(id)); pet.send('look', id); };
  for (const look of LOOKS.filter((l) => !only || only.includes(l.id))) {
    setLook(look.id);
    if (!process.env.BLIP_NO_BUBBLE) pet.send('bubble', { id: `b-${look.id}`, text: look.greeting, priority: 1, durationMs: 2000 });
    await wait(1300);
    const s = await snap(pet, `look-${look.id}.png`);
    console.log(`picture ${look.id}: ${s.w}x${s.h} at x=${s.x}`);
    await wait(1000);
  }
  if (zoom > 1) { app.quit(); return; }

  // The supercar: start near the right edge and watch it leave and come back in.
  setLook('supercar');
  await wait(900);
  const viewW = (await pet.win.webContents.executeJavaScript(STATE_JS)).viewW;
  pet.send('placed', { x: viewW - 260 });
  await wait(150);
  const drive = await track(pet, 9000);
  const xs = drive.map((s) => s.x);
  const wrapAt = xs.findIndex((x, i) => i > 0 && x < xs[i - 1]);
  const backwards = xs.filter((x, i) => i > 0 && x < xs[i - 1]).length;
  console.log(`supercar x: ${xs.join(' ')}`);
  console.log(`supercar: view ${viewW}px, moves back only ${backwards} time(s) (the wrap), wrap at sample ${wrapAt}, flip ever: ${drive.some((s) => s.flip !== 'none')}`);
  const entering = drive.find((s) => s.x < 0 && s.x > -110);
  if (entering) console.log(`supercar seen coming back in at x=${entering.x}`);

  // The GT: drive both ways and check it faces where it goes.
  setLook('gt');
  await wait(900);
  pet.send('placed', { x: Math.round(viewW / 2) });
  const gt = await track(pet, 16_000, 250);
  let checked = 0;
  let wrong = 0;
  gt.forEach((s, i) => {
    if (i === 0 || !s.walking || !gt[i - 1].walking || s.x === gt[i - 1].x) return;
    checked += 1;
    const left = s.x < gt[i - 1].x;
    if (left !== (s.flip === 'scaleX(-1)')) wrong += 1;
  });
  console.log(`gt facing: ${checked} moving samples checked, ${wrong} facing the wrong way; went left: ${gt.some((s, i) => i > 0 && s.x < gt[i - 1].x)}`);
  const leftward = gt.find((s, i) => i > 0 && s.walking && s.x < gt[i - 1].x);
  if (leftward) await snap(pet, 'look-gt-driving-left.png', { side: 40, above: 20 });

  app.quit();
}

app.whenReady().then(run).catch((error) => { console.error(error); app.exit(1); });
