import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
const recipes = read('recipes.json');
const metadata = read('recipe-metadata.json');
const cases = read('search-cases.json');
const errors = [];
const recipeFields = ['name', 'ingredients', 'recipe', 'estimated_time'];
const categories = new Set(['KOREAN', 'CHINESE', 'JAPANESE', 'WESTERN', 'BAKING', 'SNACK']);
const difficulties = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const names = new Set();
const metadataNames = new Set();
const ingredientCounts = new Set();
const stepCounts = new Set();
const metadataFields = ['name', 'description', 'category', 'difficulty', 'cooking_time_minutes', 'servings', 'tags', 'ingredient_names', 'aliases', 'likes', 'created_at', 'image_url'];

for (const [i, recipe] of recipes.entries()) {
  for (const field of recipeFields) if (typeof recipe[field] !== 'string' || !recipe[field].trim()) errors.push(`recipes[${i}].${field}`);
  if (recipe.name !== recipe.name.trim() || recipe.name !== recipe.name.normalize('NFC')) errors.push(`recipes[${i}].name normalization`);
  if (names.has(recipe.name)) errors.push(`duplicate recipe name: ${recipe.name}`);
  names.add(recipe.name);
  if (!/^([1-9]\d*)분$/.test(recipe.estimated_time)) errors.push(`recipes[${i}].estimated_time`);
  const ingredientCount = recipe.ingredients.split('\n').length;
  const stepCount = recipe.recipe.split('\n').length;
  ingredientCounts.add(ingredientCount);
  stepCounts.add(stepCount);
  if (ingredientCount < 1 || ingredientCount > 8) errors.push(`recipes[${i}] ingredient count: ${ingredientCount}`);
  if (stepCount < 1 || stepCount > 8) errors.push(`recipes[${i}] step count: ${stepCount}`);
}
if (metadata.length !== recipes.length) errors.push('metadata record count mismatch');
for (const [i, item] of metadata.entries()) {
  for (const field of metadataFields) if (!(field in item)) errors.push(`metadata[${i}] missing ${field}`);
  if (!names.has(item.name)) errors.push(`metadata orphan: ${item.name}`);
  if (metadataNames.has(item.name)) errors.push(`duplicate metadata name: ${item.name}`);
  metadataNames.add(item.name);
  const recipe = recipes.find((r) => r.name === item.name);
  if (typeof item.name !== 'string' || typeof item.description !== 'string' || !item.description.trim()) errors.push(`metadata text: ${item.name}`);
  if (!categories.has(item.category) || !difficulties.has(item.difficulty)) errors.push(`metadata enum: ${item.name}`);
  if (!Number.isInteger(item.cooking_time_minutes) || item.cooking_time_minutes < 1 || recipe.estimated_time !== `${item.cooking_time_minutes}분`) errors.push(`metadata time: ${item.name}`);
  if (!Number.isInteger(item.servings) || item.servings < 1 || !Number.isInteger(item.likes) || item.likes < 0) errors.push(`metadata integer: ${item.name}`);
  if (!Array.isArray(item.tags) || item.tags.some((v) => typeof v !== 'string' || !v.trim()) || new Set(item.tags).size !== item.tags.length || !Array.isArray(item.ingredient_names) || item.ingredient_names.some((v) => typeof v !== 'string' || !v.trim()) || !Array.isArray(item.aliases) || item.aliases.some((v) => typeof v !== 'string' || !v.trim())) errors.push(`metadata arrays: ${item.name}`);
  if (item.image_url !== null && typeof item.image_url !== 'string') errors.push(`metadata image_url: ${item.name}`);
  if (typeof item.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(item.created_at) || Number.isNaN(Date.parse(item.created_at))) errors.push(`metadata created_at: ${item.name}`);
  for (const ingredient of item.ingredient_names) if (!recipe.ingredients.split('\n').some((line) => line.startsWith(`${ingredient} `))) errors.push(`ingredient mismatch: ${item.name}/${ingredient}`);
}
if (metadataNames.size !== names.size) errors.push('metadata-to-recipe name coverage mismatch');
if (![1,2,3,4,5,6,7,8].every((count) => ingredientCounts.has(count))) errors.push('ingredient count distribution must include every value from 1 to 8');
if (![1,2,3,4,5,6,7,8].every((count) => stepCounts.has(count))) errors.push('recipe step distribution must include every value from 1 to 8');
for (const item of cases) {
  if (!Array.isArray(item.fields) || !Array.isArray(item.expected_names) || typeof item.query !== 'string' || typeof item.match_rule !== 'string') errors.push('invalid search case');
  for (const name of item.expected_names) if (!names.has(name)) errors.push(`unknown case name: ${name}`);
}
if (errors.length) { console.error(`Validation failed (${errors.length}):\n${errors.join('\n')}`); process.exitCode = 1; }
else console.log(JSON.stringify({ valid: true, recipes: recipes.length, metadata: metadata.length, searchCases: cases.length, categories: [...categories].every((v) => metadata.some((m) => m.category === v)), difficulties: [...difficulties].every((v) => metadata.some((m) => m.difficulty === v)) }, null, 2));
