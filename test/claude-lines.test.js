'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createLinePool, makeClaudeGenerator, FALLBACK_LINES, buildPrompt } = require('../src/claude-lines');

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('take waits for the first batch, then serves from the pool without new calls', async () => {
  let calls = 0;
  const pool = createLinePool({ generate: async () => { calls += 1; return ['a', 'b', 'c', 'd']; } });
  assert.equal(await pool.take('encourage'), 'a');
  assert.equal(await pool.take('encourage'), 'b');
  assert.equal(calls, 1);
});

test('the pool tops up only once it runs low', async () => {
  let calls = 0;
  const pool = createLinePool({ generate: async () => { calls += 1; return ['a', 'b', 'c', 'd']; } });
  await pool.take('funny'); // 3 left
  await pool.take('funny'); // 2 left
  await tick();
  assert.equal(calls, 1);
  await pool.take('funny'); // 1 left -> top up
  await tick();
  assert.equal(calls, 2);
});

test('a failed Claude call falls back to a built-in line', async () => {
  const errors = [];
  const pool = createLinePool({
    generate: async () => { throw new Error('offline'); },
    random: () => 0,
    onError: (e) => errors.push(e.message),
  });
  assert.equal(await pool.take('checkin'), FALLBACK_LINES.checkin[0]);
  assert.deepEqual(errors.slice(0, 1), ['offline']);
});

test('lines older than three hours are thrown away', async () => {
  let now = 0;
  let batch = 0;
  const pool = createLinePool({
    nowFn: () => now,
    generate: async () => { batch += 1; return [`b${batch}-1`, `b${batch}-2`, `b${batch}-3`, `b${batch}-4`]; },
  });
  assert.equal(await pool.take('encourage'), 'b1-1');
  await tick();
  now = 4 * 60 * 60 * 1000;
  assert.equal(pool.hasReady('encourage'), false);
  assert.equal(await pool.take('encourage'), 'b2-1');
});

test('unknown kinds are rejected', async () => {
  const pool = createLinePool({ generate: async () => ['a'] });
  await assert.rejects(() => pool.take('rant'), /unknown line kind/);
});

test('generator passes the prompt on stdin, uses minimal flags and no shell', async () => {
  let captured;
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.stdin = Object.assign(new EventEmitter(), { end: (input) => {
      captured = { command, args, options, input };
      setImmediate(() => { child.stdout.emit('data', 'Keep going!\nYou rock.\n'); child.emit('close', 0); });
    } });
    return child;
  };
  const generate = makeClaudeGenerator({
    systemPromptFile: 'C:\\blip\\system-prompt.txt', cwd: 'C:\\blip', spawnImpl,
    claude: { command: 'C:\\claude.exe', shell: false },
    nowFn: () => new Date(2026, 10, 25, 9),
  });
  const lines = await generate('encourage', 4, ['Old line']);
  assert.deepEqual(lines, ['Keep going!', 'You rock.']);
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.env.CLAUDECODE, undefined);
  for (const flag of ['-p', '--strict-mcp-config', '--no-session-persistence', '--system-prompt-file']) {
    assert.ok(captured.args.includes(flag), flag);
  }
  assert.match(captured.input, /Write 4 different short lines of encouragement/);
  assert.match(captured.input, /morning on Wednesday/);
  assert.match(captured.input, /Do not repeat any of these: Old line/);
});

test('generator rejects when Claude exits with an error', async () => {
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.stdin = Object.assign(new EventEmitter(), { end: () => setImmediate(() => { child.stderr.emit('data', 'not logged in'); child.emit('close', 1); }) });
    return child;
  };
  const generate = makeClaudeGenerator({ systemPromptFile: 'x', cwd: '.', spawnImpl, claude: { command: 'c', shell: false } });
  await assert.rejects(() => generate('funny', 4, []), /not logged in/);
});

test('buildPrompt never mentions anything but the line kind and time of day', () => {
  const prompt = buildPrompt('funny', 4, [], new Date(2026, 10, 25, 20));
  assert.match(prompt, /evening on Wednesday/);
});

test('on a Mac, Claude Code is found in its usual install places and run without a shell', () => {
  const { resolveClaude } = require('../src/claude-lines');
  const at = (found) => ({ platform: 'darwin', home: '/Users/sam', exists: (file) => file === found });
  assert.deepEqual(resolveClaude({}, at('/Users/sam/.local/bin/claude')), { command: '/Users/sam/.local/bin/claude', shell: false });
  assert.deepEqual(resolveClaude({}, at('/opt/homebrew/bin/claude')), { command: '/opt/homebrew/bin/claude', shell: false });
  assert.deepEqual(resolveClaude({}, at('nowhere')), { command: 'claude', shell: false });
});

test('a missing Claude Code is a plain rejection, even if writing the prompt fails too', async () => {
  const { runClaude } = require('../src/claude-lines');
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.stdin = Object.assign(new EventEmitter(), { end: () => setImmediate(() => {
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    }) });
    return child;
  };
  await assert.rejects(runClaude({ input: 'x', systemPromptFile: 'p.txt', cwd: '.', spawnImpl, claude: { command: 'claude', shell: false } }), /ENOENT/);
});
