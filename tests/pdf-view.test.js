import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPages } from '../src/pdf-view.js';

// 300 pages, each 1000 tall with a 12 gap, the first starting at y=0.
const N = 300, H = 1000, G = 12;
const tops = Array.from({ length: N }, (_, i) => i * (H + G));
const bottoms = tops.map((t) => t + H);

test('only pages near the screen are drawn, the rest stay empty', () => {
  const view = 150 * (H + G); // looking at page 150 (index 150)
  const plan = planPages(tops, bottoms, view, view + 700, 700 * 1.5, 700 * 3);
  assert.ok(plan.render.length >= 1 && plan.render.length <= 4, `rendering ${plan.render.length} pages`);
  assert.ok(plan.render.includes(150));
  assert.ok(plan.render.every((i) => Math.abs(i - 150) <= 2));
});

test('pages far from the screen are released, close-by ones are kept', () => {
  const view = 150 * (H + G);
  const plan = planPages(tops, bottoms, view, view + 700, 700 * 1.5, 700 * 3);
  assert.ok(plan.release.includes(0) && plan.release.includes(299) && plan.release.includes(100));
  assert.ok(!plan.release.includes(150) && !plan.release.includes(151) && !plan.release.includes(149));
  assert.equal(plan.render.length + plan.release.length <= N, true);
});

test('the page you are looking at is drawn first', () => {
  const view = 40 * (H + G) + 300; // part-way down page 40
  const plan = planPages(tops, bottoms, view, view + 700, 1050, 2100);
  assert.equal(plan.render[0], 40);
});

test('a small document is drawn completely when the window is tall enough to reach it', () => {
  const t = [0, 1012, 2024], b = [1000, 2012, 3024];
  const plan = planPages(t, b, 0, 1000, 1500, 3000); // 1000px-tall window: margins 1.5x and 3x
  assert.deepEqual([...plan.render].sort(), [0, 1, 2]);
  assert.deepEqual(plan.release, []);
});
