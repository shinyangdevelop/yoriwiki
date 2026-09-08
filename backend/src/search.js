export const CATEGORIES = { KOREAN: '한식', CHINESE: '중식', JAPANESE: '일식', WESTERN: '양식', BAKING: '베이킹', SNACK: '간식' };
const normalize = value => String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/gu, '');
const strings = value => Array.isArray(value) ? value.filter(v => typeof v === 'string').join(' ') : '';
const number = (value, fallback, min, max) => {
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error('숫자 필터 범위가 올바르지 않습니다.');
    return parsed;
};
export function searchRecipes(recipes, input) {
    const query = input.q === undefined ? null : String(input.q).normalize('NFC').trim();
    if (query !== null && query.length > 100) throw new Error('검색어는 100자 이내로 입력해주세요.');
    const field = input.field || 'all';
    const mode = input.mode || 'and';
    const category = input.category || '';
    const sort = input.sort || 'relevance';
    if (!['all', 'name', 'aliases', 'ingredients', 'recipe'].includes(field) || !['and', 'or'].includes(mode)
        || (category && !Object.hasOwn(CATEGORIES, category)) || !['relevance', 'time', 'difficulty', 'likes', 'newest'].includes(sort)) throw new Error('검색 옵션이 올바르지 않습니다.');
    const maxTime = number(input.maxTime, null, 1, 10080);
    const maxDifficulty = number(input.maxDifficulty, null, 1, 10);
    const requestedPage = number(input.page, 1, 1, 100000);
    const pageSize = 12;
    const tokens = (query || '').split(/\s+/u).filter(Boolean).map(normalize);
    const matched = recipes.flatMap(recipe => {
        const meta = recipe.metadata || {};
        if (category && meta.category !== category) return [];
        if (maxTime !== null && !(typeof meta.cooking_time_minutes === 'number' && meta.cooking_time_minutes <= maxTime)) return [];
        if (maxDifficulty !== null && !(typeof meta.difficulty === 'number' && meta.difficulty <= maxDifficulty)) return [];
        if (query === '') return [];
        const fields = {
            name: normalize(recipe.name), aliases: normalize(strings(meta.aliases)),
            ingredients: normalize(recipe.ingredients), recipe: normalize(recipe.recipe)
        };
        const keys = field === 'all' ? Object.keys(fields) : field === 'name' ? ['name', 'aliases'] : [field];
        const matches = token => keys.some(key => fields[key].includes(token));
        if (query !== null && !(mode === 'and' ? tokens.every(matches) : tokens.some(matches))) return [];
        const matchingFields = query === null ? [] : keys.filter(key => tokens.some(token => fields[key].includes(token)));
        const term = normalize(query);
        const relevance = !term ? 0 : fields.name === term ? 100 : fields.name.startsWith(term) ? 80 : fields.name.includes(term) ? 60 : fields.aliases.includes(term) ? 50 : matchingFields.includes('ingredients') ? 30 : 10;
        return [{ recipe, relevance, matchingFields }];
    });
    const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : Infinity;
    const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
    matched.sort((a, b) => {
        const am = a.recipe.metadata || {}, bm = b.recipe.metadata || {};
        let order = 0;
        if (sort === 'time') order = finite(am.cooking_time_minutes) - finite(bm.cooking_time_minutes);
        else if (sort === 'difficulty') order = finite(am.difficulty) - finite(bm.difficulty);
        else if (sort === 'likes') order = (typeof bm.likes === 'number' ? bm.likes : 0) - (typeof am.likes === 'number' ? am.likes : 0);
        else if (sort === 'newest') order = date(bm.created_at) - date(am.created_at);
        else order = b.relevance - a.relevance;
        return order || a.recipe.id - b.recipe.id;
    });
    const total = matched.length;
    const pages = Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, pages || 1);
    const items = matched.slice((page - 1) * pageSize, page * pageSize).map(({ recipe, matchingFields }) => ({ ...recipe, matchingFields }));
    return { items, total, page, pages, pageSize, query, field, mode, category, sort, maxTime, maxDifficulty };
}
