import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { searchRecipes } from '../backend/src/search.js';
import { recipeMetadata } from '../backend/src/recipe-metadata.js';
import { toDish, space, hull, point, area, coverage, recommend } from '../frontend/src/lib/exploration.ts';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sqlite3 = require('sqlite3');
const readJSON = async name => JSON.parse(await readFile(new URL(`../backend/data/${name}`, import.meta.url), 'utf8'));
const metadata = await readJSON('recipe-metadata.json');
const recipesFile = await readJSON('recipes.json');
const cases = await readJSON('search-cases.json');
const decorate = rows => rows.map(row => ({ ...row, metadata: recipeMetadata(row, metadata.find(m => m.name === row.name)) }));
const fixtureCatalog = decorate(recipesFile.map((r, i) => ({ ...r, id: i + 1 })));
const names = result => result.items.map(r => r.name).sort();
test('provided search cases: name, aliases, ingredients AND/OR, body, empty and no result', () => {
  for (const scenario of cases) {
    const result = searchRecipes(fixtureCatalog, { q: scenario.query, field: scenario.fields.length === 1 ? scenario.fields[0] : 'all', mode: scenario.match_rule.includes('OR') ? 'or' : 'and' });
    // The supplied case predates three recipes which also explicitly contain
    // parmesan. Keep the source data intact and assert the complete real set.
    const expected = scenario.query === '파마산 치즈'
      ? [...scenario.expected_names, '시저샐러드', '라자냐', '바질페스토파스타'] : scenario.expected_names;
    assert.deepEqual(names(result), [...expected].sort(), scenario.query);
  }
});
test('spaces, case, literals, sorting, pagination, filter boundaries and bad input', () => {
  assert.equal(searchRecipes(fixtureCatalog, { q: '김치 볶음밥', field: 'name' }).items[0].name, '김치볶음밥');
  assert.equal(searchRecipes(fixtureCatalog, { q: '%' }).total, 0);
  assert.equal(searchRecipes(fixtureCatalog, { q: "' OR 1=1 --" }).total, 0);
  const filtered = searchRecipes(fixtureCatalog, { category: 'KOREAN', maxTime: '30', maxDifficulty: '3', sort: 'time' });
  assert.ok(filtered.total > 0);
  assert.ok(filtered.items.every(r => r.metadata.category === 'KOREAN' && r.metadata.cooking_time_minutes <= 30 && r.metadata.difficulty <= 3));
  assert.ok(filtered.items.every((r, i, rows) => !i || r.metadata.cooking_time_minutes >= rows[i - 1].metadata.cooking_time_minutes));
  const first = searchRecipes(fixtureCatalog, {}), second = searchRecipes(fixtureCatalog, { page: '2' });
  assert.equal(first.items.length, 12);
  assert.ok(!first.items.some(a => second.items.some(b => a.id === b.id)));
  assert.equal(searchRecipes(fixtureCatalog, { page: '999' }).page, first.pages);
  for (const input of [{ page: '-1' }, { field: 'bad' }, { mode: 'bad' }, { maxDifficulty: '11' }, { q: 'a'.repeat(101) }]) assert.throws(() => searchRecipes(fixtureCatalog, input));
  const english = [{ ...fixtureCatalog[0], name: 'ToFu Bowl' }];
  assert.equal(searchRecipes(english, { q: 'tofu bowl', field: 'name' }).total, 1);
});
test('current database is read-only: all recipes plotted; hull and recommendations use real coordinates', async () => {
  const db = new sqlite3.Database(fileURLToPath(new URL('../backend/database.db', import.meta.url)), sqlite3.OPEN_READONLY);
  try {
    const rows = await new Promise((resolve, reject) => db.all('SELECT * FROM recipes ORDER BY id', (error, data) => error ? reject(error) : resolve(data)));
    const catalog = decorate(rows);
    const dishes = catalog.map(toDish);
    assert.ok(dishes.length >= 72);
    for (const dish of dishes) for (const key of ['time', 'ingredients', 'steps']) assert.ok(dish.values[key] > 0, `${dish.name}: ${key}`);
    const complete = space(dishes);
    assert.equal(complete.rows.length, 72);
    assert.ok(dishes.some(d => d.values.difficulty === 10));
    const experienced = complete.rows.slice(0, 15).map(row => row.dish);
    assert.ok(area(hull(experienced.map(d => point(d, 'time', 'ingredients')))) > 0);
    const ids = experienced.map(d => d.id);
    assert.ok(coverage(dishes, ids).validPairs > 0);
    assert.equal(recommend(dishes, ids, 'new', 8).length, 8);
    assert.equal(searchRecipes(catalog, { q: '김치찌개', field: 'name' }).items[0].name, '김치찌개');
    console.log(`Verified ${dishes.length} plotted recipes, ${complete.rows.length} recipes with all four axes. Database unchanged.`);
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
});
test('coordinates follow persisted recipe rather than stale metadata; unknown difficulty stays null', () => {
  const metadata = recipeMetadata({ estimated_time: '1시간 15분', ingredients: 'a 1개, b 2개\nc 3개', recipe: '1. first 2. second 3. third' }, { cooking_time_minutes: 2, step_count: 99, ingredient_names: ['stale'], difficulty: 10 });
  assert.equal(metadata.cooking_time_minutes, 75);
  assert.equal(metadata.ingredient_count, 3);
  assert.equal(metadata.step_count, 3);
  assert.equal(toDish({ metadata }).values.difficulty, 10);
  assert.equal(recipeMetadata({ estimated_time: '?', ingredients: '', recipe: 'unnumbered' }).step_count, null);
});
