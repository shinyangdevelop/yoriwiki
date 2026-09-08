import express from 'express';
import { auth } from './auth.js';
import { getExplorationCatalog } from './exploration.js';
import { searchRecipes } from './search.js';
import {
    initializeDatabase,
    getRecipe,
    getFoodIndex,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    createRating,
    deleteRating,
    getRatingAverage
} from './database.js';

const app = express();
const port = Number(process.env.PORT) || 8080;

app.use(express.json());
app.use('/auth', auth);
app.get('/explore', async (req, res) => res.json(await getExplorationCatalog()));
app.get('/search', async (req, res) => {
    const catalog = await getExplorationCatalog();
    try {
        return res.json({ ...searchRecipes(catalog.recipes, req.query), warning: catalog.warning });
    } catch (error) {
        return res.status(400).send(error.message);
    }
});

app.get('/test', (req, res) => {
    res.status(200).send('Server is running!');
});

app.get('/food', async (req, res) => {
    const { id } = req.query;
    if (id !== undefined) {
        const result = await getRecipe(id);
        if (!result) return res.status(404).send('요리를 찾을 수 없습니다.');
        return res.json(result);
    }

    return res.json(await getFoodIndex());
});

app.post('/food', async (req, res) => {
    const { name, ingredients, estimated_time, recipe } = req.body ?? {};
    const required = [name, ingredients, estimated_time, recipe];
    if (required.some((value) => value === undefined || value === null || value === '')) {
        return res.status(400).send('name, ingredients, estimated_time, recipe가 모두 필요합니다.');
    }

    const newId = await createRecipe(name, ingredients, recipe, estimated_time);
    return res.status(201).send(newId);
});

app.put('/food', async (req, res) => {
    const { id } = req.query;
    const { ingredients, estimated_time, recipe } = req.body ?? {};
    if (!id) return res.status(400).send('요리 ID(?id=...)가 필요합니다.');
    if ([ingredients, estimated_time, recipe].every((value) => value === undefined)) {
        return res.status(400).send('수정할 요리 정보가 필요합니다.');
    }

    const changes = await updateRecipe(id, { ingredients, estimated_time, recipe });
    if (changes === 0) return res.status(404).send('요리를 찾을 수 없습니다.');
    return res.sendStatus(200);
});

app.delete('/food', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).send('요리 이름(?name=...)이 필요합니다.');

    const changes = await deleteRecipe(name);
    if (changes === 0) return res.status(404).send('요리를 찾을 수 없습니다.');
    return res.sendStatus(200);
});

app.post('/food/rate', async (req, res) => {
    const { name } = req.query;
    const { rating, comment } = req.body ?? {};
    if (!name) return res.status(400).send('요리 이름(?name=...)이 필요합니다.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).send('평점은 1부터 5 사이의 정수여야 합니다.');
    }

    const rateId = await createRating(name, rating, comment);
    if (rateId === null) return res.status(404).send('요리를 찾을 수 없습니다.');
    return res.status(201).send(rateId);
});

app.delete('/food/rate', async (req, res) => {
    const { name, rateId } = req.query;
    if (!name || !rateId) {
        return res.status(400).send('요리 이름과 평가 ID(?name=...&rateId=...)가 모두 필요합니다.');
    }

    const changes = await deleteRating(name, rateId);
    if (changes === 0) return res.status(404).send('평가를 찾을 수 없습니다.');
    return res.sendStatus(200);
});

app.get('/food/rating', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('요리 ID(?id=...)가 필요합니다.');
    if (!await getRecipe(id)) return res.status(404).send('요리를 찾을 수 없습니다.');

    return res.json(await getRatingAverage(id));
});

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
        return res.status(400).send('JSON 형식이 올바르지 않습니다.');
    }
    if (error.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).send('이미 존재하거나 저장할 수 없는 데이터입니다.');
    }
    return res.status(500).send('서버 오류가 발생했습니다.');
});

try {
    await initializeDatabase();
    app.listen(port, () => console.log(`Server opened at port ${port}.`));
} catch (error) {
    console.error('Sqlite Database initialization failed:', error);
    process.exitCode = 1;
}
