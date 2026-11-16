import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter, POINTER_FILTER } from '../src/filters.js';

// Deterministic "random" so the test never flakes.
const rng = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5; })();
const std = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const make = () => new OneEuroFilter(POINTER_FILTER);

test('a still but shaky hand is steadied a lot', () => {
  const f = make();
  const input = [], output = [];
  for (let i = 0; i < 300; i++) { const x = 0.5 + rng() * 0.02; input.push(x); output.push(f.filter(x, i * 33)); }
  assert.ok(std(output.slice(30)) < std(input.slice(30)) * 0.4, `in=${std(input)} out=${std(output)}`);
});

test('a real move is followed quickly (not left lagging behind)', () => {
  const f = make();
  for (let i = 0; i < 30; i++) f.filter(0.2, i * 33);
  let out = 0.2;
  for (let i = 0; i < 12; i++) out = f.filter(0.8, (30 + i) * 33); // jump 0.2 -> 0.8
  assert.ok(out > 0.2 + 0.6 * 0.9, `after 12 frames: ${out}`); // >90% of the way in ~0.4 s
});

test('reset forgets history', () => {
  const f = make();
  f.filter(0.2, 0); f.filter(0.2, 33);
  f.reset();
  assert.equal(f.filter(0.9, 100), 0.9);
});
