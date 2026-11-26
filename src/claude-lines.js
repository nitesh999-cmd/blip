'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { cleanLines, partOfDay } = require('./logic');

const KINDS = Object.freeze({
  encourage: 'short lines of encouragement for someone working at their computer',
  funny: 'short funny lines: light jokes, silly observations or playful puns a tiny desktop pet might say',
  checkin: 'short, caring check-in lines that ask how the person is doing or nudge a small reset (water, a stretch, a breath, a break)',
});

const FALLBACK_LINES = Object.freeze({
  encourage: [
    'You are doing better than you think.', 'One small step, then the next. You have got this.', 'Proud of you for showing up today.',
    'Slow progress is still progress.', 'You have handled hard days before. This one too.', 'Look how much you have done already.',
    'Keep going. Future you says thanks.', 'You are allowed to be a work in progress.',
  ],
  funny: [
    'Photosynthesis is my side hustle.', 'My cardio is waddling along your screen in a pot.', 'I would help with the typing, but I am a plant.',
    'I asked for a raise. They gave me more soil.', 'Do not worry, I only judge your browser tabs a little.', 'I am rooting for you. Literally.',
    'My hobbies include standing still and being green.', 'Plot twist: I am the one watering you.',
  ],
  checkin: [
    'How are you holding up? Maybe a sip of water?', 'Quick check: shoulders down, deep breath. Better?', 'Been sitting a while. Want to stretch with me?',
    'Eyes off the screen for twenty seconds?', 'Have you eaten something good today?', 'When did you last step outside?',
    'Unclench your jaw. I will wait.', 'One deep breath with me? In... and out.',
  ],
});

const SYSTEM_PROMPT = [
  "You are Blip, a tiny cheerful seedling in a terracotta pot who waddles along the bottom of someone's computer screen and talks in little speech bubbles.",
  'Your plant grows through the day, from a little shoot in the morning to a flower by evening.',
  'You are warm, playful and genuine, never preachy or corporate.',
  'Reply with only the requested lines, one per line, nothing else.',
].join(' ');

const MODEL = 'haiku';
const BATCH_SIZE = 4;
const LOW_WATER = 1;
const LINE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const CALL_TIMEOUT_MS = 45_000;
const RECENT_MEMORY = 8;

/** Where Claude Code usually lives on a Mac (native installer, older local install, Homebrew or npm). */
const MAC_CLAUDE_PLACES = (home) => [
  path.posix.join(home, '.local', 'bin', 'claude'),
  path.posix.join(home, '.claude', 'local', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
];

/**
 * The Claude Code program to run, so arguments never pass through a shell where avoidable.
 * Windows: the real claude.exe behind the npm shim. Mac/Linux: its usual install places, then PATH.
 */
function resolveClaude(env = process.env, { platform = process.platform, home = os.homedir(), exists = fs.existsSync } = {}) {
  if (platform === 'win32') {
    const exe = path.join(env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (env.APPDATA && exists(exe)) return { command: exe, shell: false };
    return { command: 'claude', shell: true };
  }
  const found = MAC_CLAUDE_PLACES(home).find((file) => exists(file));
  return { command: found || 'claude', shell: false };
}

function shellQuote(arg) {
  if (arg === '') return '""';
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function buildPrompt(kind, count, recent, now) {
  const avoid = recent.length ? `\nDo not repeat any of these: ${recent.join(' | ')}` : '';
  const when = `${partOfDay(now)} on ${now.toLocaleDateString('en-AU', { weekday: 'long' })}`;
  return `Write ${count} different ${KINDS[kind]}. It is ${when}.\nEach line at most 14 words. One per line. No numbering, no quotes, no emojis, no hashtags.${avoid}\n`;
}

/**
 * One Claude call using the user's existing Claude Code sign-in; resolves with its text.
 * Minimal mode: no settings, hooks, MCP servers, tools or saved session. Prompt goes in on stdin.
 */
function runClaude({ input, systemPromptFile, cwd, spawnImpl = spawn, claude = resolveClaude(), timeoutMs = CALL_TIMEOUT_MS }) {
  const args = [
    '-p', '--model', MODEL, '--setting-sources', '', '--strict-mcp-config', '--tools', '',
    '--no-session-persistence', '--system-prompt-file', systemPromptFile,
  ];
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return new Promise((resolve, reject) => {
    const child = spawnImpl(claude.command, claude.shell ? args.map(shellQuote) : args, {
      cwd, env, shell: claude.shell, windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.trim().slice(0, 300)}`));
    });
    // If Claude Code isn't there, writing the prompt can fail too; the spawn error above already says why.
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** Asks Claude for a batch of Blip's lines. */
function makeClaudeGenerator({ systemPromptFile, cwd, spawnImpl = spawn, claude = resolveClaude(), nowFn = () => new Date() }) {
  return async function generate(kind, count, recent) {
    const stdout = await runClaude({ input: buildPrompt(kind, count, recent, nowFn()), systemPromptFile, cwd, spawnImpl, claude });
    const lines = cleanLines(stdout);
    if (!lines.length) throw new Error('claude returned no lines');
    return lines;
  };
}

/** Lines are generated only when asked for, in small batches, and topped up as they are used. */
function createLinePool({ generate, nowFn = Date.now, random = Math.random, onError = () => {} }) {
  let pools = { encourage: [], funny: [], checkin: [] };
  let recent = { encourage: [], funny: [], checkin: [] };
  const inflight = new Map();

  const fresh = (kind) => pools[kind].filter((entry) => nowFn() - entry.at < LINE_MAX_AGE_MS);

  function refill(kind) {
    if (inflight.has(kind)) return inflight.get(kind);
    const job = generate(kind, BATCH_SIZE, recent[kind])
      .then((lines) => {
        const at = nowFn();
        pools = { ...pools, [kind]: [...fresh(kind), ...lines.map((text) => ({ text, at }))] };
      })
      .catch(onError)
      .finally(() => inflight.delete(kind));
    inflight.set(kind, job);
    return job;
  }

  function hasReady(kind) {
    return fresh(kind).length > 0;
  }

  async function take(kind) {
    if (!KINDS[kind]) throw new Error(`unknown line kind: ${kind}`);
    if (!hasReady(kind)) await refill(kind);
    const [next, ...rest] = fresh(kind);
    pools = { ...pools, [kind]: rest };
    const text = next ? next.text : FALLBACK_LINES[kind][Math.floor(random() * FALLBACK_LINES[kind].length)];
    recent = { ...recent, [kind]: [...recent[kind], text].slice(-RECENT_MEMORY) };
    if (rest.length <= LOW_WATER) refill(kind);
    return text;
  }

  return { take, hasReady };
}

module.exports = { KINDS, FALLBACK_LINES, SYSTEM_PROMPT, resolveClaude, runClaude, makeClaudeGenerator, createLinePool, buildPrompt };
