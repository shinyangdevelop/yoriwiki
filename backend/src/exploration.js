import { readFile } from 'node:fs/promises';
import { all } from './database.js';

import { recipeMetadata } from './recipe-metadata.js';

// Optional structured data supplied by the data author. No synthetic values.
export async function getExplorationCatalog() {
    let metadata = [];
    let warning = '';
    try {
        metadata = JSON.parse(await readFile(new URL('../data/recipe-metadata.json', import.meta.url), 'utf8'));
        if (!Array.isArray(metadata)) throw new Error('Metadata must be an array');
    } catch (error) {
        if (error.code !== 'ENOENT') warning = '추가 데이터 형식을 확인해주세요. 기본 레시피 데이터만 표시합니다.';
        metadata = [];
    }
    const byName = new Map(metadata.filter((item) => item && typeof item.name === 'string').map((item) => [item.name, item]));
    const recipes = (await all('SELECT * FROM recipes ORDER BY id')).map((recipe) => {
        const extra = byName.get(recipe.name) || {};
        return { ...recipe, metadata: recipeMetadata(recipe, extra) };
    });
    return { recipes, warning };
}
