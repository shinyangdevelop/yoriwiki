import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recipes = JSON.parse(fs.readFileSync(path.join(backendDir, 'data', 'recipes.json'), 'utf8'));
const apiBase = process.env.RECIPE_API_BASE ?? 'http://localhost:8080';
let indexResponse;
try {
  indexResponse = await fetch(`${apiBase}/food`);
} catch (error) {
  const reason = error?.cause?.code ?? error?.code ?? error?.message;
  throw new Error(`API 서버에 연결할 수 없습니다 (${apiBase}). 별도 터미널에서 \"npm --prefix backend start\"를 실행한 뒤 다시 시도하세요. 원인: ${reason}`);
}
if (!indexResponse.ok) throw new Error(`목록 조회 실패: ${indexResponse.status}`);
const existing = new Map((await indexResponse.json()).map(({ name, id }) => [name, id]));
const results = [];
for (const recipe of recipes) {
  if (existing.has(recipe.name)) {
    const id = existing.get(recipe.name);
    const response = await fetch(`${apiBase}/food?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ingredients: recipe.ingredients, recipe: recipe.recipe, estimated_time: recipe.estimated_time })
    });
    if (!response.ok) throw new Error(`${recipe.name} update 실패: ${response.status} ${await response.text()}`);
    results.push({ name: recipe.name, id, status: 'updated_existing' });
    continue;
  }
  const response = await fetch(`${apiBase}/food`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipe) });
  if (!response.ok) throw new Error(`${recipe.name} import 실패: ${response.status} ${await response.text()}`);
  results.push({ name: recipe.name, id: Number(await response.text()), status: 'created' });
}
fs.writeFileSync(path.join(backendDir, 'data', 'import-results.json'), JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ created: results.filter((r) => r.status === 'created').length, updated_existing: results.filter((r) => r.status === 'updated_existing').length, resultsFile: 'backend/data/import-results.json' }));
