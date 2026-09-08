import test from 'node:test';
import assert from 'node:assert/strict';
import { hull, area, inside, toDish, recommend, coverage, space } from '../frontend/src/lib/exploration.ts';

// Numeric fixtures only: no application recipe or seed data is generated.
const dish = (id, time, ingredients, steps = 1) => ({ id, name: String(id), values: { time, ingredients, steps, difficulty: null } });
test('CCW hull removes duplicates and inner points; shoelace area is exact', () => {
  const polygon = hull([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
  assert.equal(polygon.length, 4);
  assert.equal(area(polygon), 4);
  assert.equal(inside({ x: 1, y: 1 }, polygon), true);
  assert.equal(inside({ x: 2, y: 1 }, polygon), true);
  assert.equal(inside({ x: 3, y: 1 }, polygon), false);
});
test('empty, single, duplicate, and collinear experiences have no area', () => {
  for (const points of [[], [{ x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]]) {
    const polygon = hull(points);
    assert.equal(area(polygon), 0);
    assert.equal(inside({ x: 1, y: 1 }, polygon), false);
  }
});
test('only explicit metadata provides coordinates; missing values remain missing', () => {
  const raw = { id: 1, name: '', estimated_time: '30분', ingredients: 'a,b', recipe: '1. step 2. step' };
  assert.deepEqual(toDish(raw).values, { time: null, ingredients: null, steps: null, difficulty: null });
  assert.deepEqual(toDish({ ...raw, metadata: { cooking_time_minutes: 30, ingredient_names: ['a', 'a', 'b'], step_count: 3, difficulty: 2 } }).values, { time: 30, ingredients: 2, steps: 3, difficulty: 2 });
  assert.equal(toDish({ ...raw, metadata: { step_count: -2, cooking_time_minutes: '30', difficulty: 9 } }).values.time, null);
});
test('coverage counts each valid axis pair, excludes done/outside, includes boundaries', () => {
  const dishes = [dish(1, 1, 1), dish(2, 3, 1), dish(3, 1, 3), dish(4, 1.5, 1.5), dish(5, 2, 2), dish(6, 3, 3)];
  const result = coverage(dishes, [1, 2, 3]);
  assert.equal(result.validPairs, 1);
  assert.deepEqual(result.ranked.map(r => [r.dish.id, r.hits, r.total]), [[4, 1, 1], [5, 1, 1]]);
  assert.equal(coverage(dishes, [1, 2]).validPairs, 0);
});
test('multi-axis ranking uses comparable complete rows and distinct unordered pairs', () => {
  const dishes = [dish(1, 1, 1, 1), dish(2, 3, 1, 3), dish(3, 1, 3, 3), dish(4, 1.5, 1.5, 2), dish(5, 2, null, 2)];
  assert.equal(space(dishes).pairs.length, 3);
  const result = coverage(dishes, [1, 2, 3]);
  assert.equal(result.validPairs, 3);
  assert.equal(result.excluded, 1);
  assert.deepEqual(result.ranked.map(r => [r.dish.id, r.hits]), [[4, 3]]);
});
test('greedy updates the reference set after each pick, avoiding repeated distant cluster', () => {
  const dishes = [dish(1, 1, 1), dish(2, 10, 10), dish(3, 9.9, 9.9), dish(4, 10, 1)];
  const result = recommend(dishes, [1], 'new', 3);
  assert.deepEqual(result.map(r => r.dish.id), [2, 4, 3]);
  assert.equal(result[0].areaUsed, false);
  assert.equal(result[2].areaUsed, true);
  assert.deepEqual(recommend(dishes, [], 'new'), []);
  assert.deepEqual(recommend(dishes, [1, 2, 3, 4], 'new'), []);
});
test('familiar/new modes differ; filters, limits and normalization stay deterministic', () => {
  const dishes = [dish(1, 1, 1), dish(2, 3, 1), dish(3, 1, 3), dish(4, 1.5, 1.5), dish(5, 10, 10)];
  assert.equal(recommend(dishes, [1, 2, 3], 'familiar', 1)[0].dish.id, 4);
  assert.equal(recommend(dishes, [1, 2, 3], 'new', 1)[0].dish.id, 5);
  assert.equal(recommend(dishes, [1, 2, 3], 'new', 1, 5)[0].dish.id, 4);
  const scaled = dishes.map(d => ({ ...d, values: { ...d.values, time: d.values.time * 60 } }));
  assert.deepEqual(recommend(scaled, [1, 2, 3], 'new').map(r => r.dish.id), recommend(dishes, [1, 2, 3], 'new').map(r => r.dish.id));
  assert.equal(coverage(dishes, [1, 2, 3], 1).ranked.length, 1);
});
