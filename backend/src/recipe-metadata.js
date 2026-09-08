export function recipeMetadata(recipe, extra = {}) {
    const time = /^(?:(\d+(?:\.\d+)?)\s*시간)?\s*(?:(\d+(?:\.\d+)?)\s*분)?$/.exec(recipe.estimated_time.trim());
    const minutes = time && (time[1] || time[2]) ? Number(time[1] || 0) * 60 + Number(time[2] || 0) : null;
    const ingredients = recipe.ingredients.split(/[,\n]+/).map(value => value.trim()).filter(Boolean);
    const steps = [...recipe.recipe.matchAll(/(?:^|\s)(\d+)[.)]\s+/g)];
    const sequential = steps.length > 0 && steps.every((step, index) => Number(step[1]) === index + 1);
    return {
        ...extra,
        // These counts describe the persisted recipe, including legacy rows.
        cooking_time_minutes: minutes > 0 ? minutes : null,
        ingredient_count: ingredients.length || null,
        step_count: sequential ? steps.length : null,
        difficulty: Number.isInteger(extra.difficulty) && extra.difficulty >= 1 && extra.difficulty <= 10 ? extra.difficulty : null
    };
}

