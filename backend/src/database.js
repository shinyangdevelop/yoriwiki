import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const databasePath = process.env.DATABASE_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.db');
const db = new sqlite3.Database(databasePath);

function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (error) {
            if (error) reject(error);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (error, row) => {
            if (error) reject(error);
            else resolve(row);
        });
    });
}

function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

async function initializeDatabase() {
    await run('PRAGMA foreign_keys = ON');
    await run('PRAGMA busy_timeout = 5000');
    await run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        nickname TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        terms_accepted_at TEXT NOT NULL,
        privacy_accepted_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    )`);
    await run(`
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            ingredients TEXT NOT NULL,
            recipe TEXT NOT NULL,
            estimated_time TEXT NOT NULL
        )
    `);
    await run(`
        CREATE TABLE IF NOT EXISTS rates (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            recipe INTEGER NOT NULL,
            point INTEGER NOT NULL DEFAULT 5 CHECK (point BETWEEN 1 AND 5),
            comment TEXT,
            FOREIGN KEY (recipe) REFERENCES recipes(id) ON DELETE CASCADE
        )
    `);
    await run(`CREATE TABLE IF NOT EXISTS cooked_recipes (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        cooked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, recipe_id)
    )`);
    const rateColumns = await all('PRAGMA table_info(rates)');
    if (!rateColumns.some((column) => column.name === 'comment')) {
        await run('ALTER TABLE rates ADD COLUMN comment TEXT');
    }
}

function getRecipe(id) {
    return get('SELECT * FROM recipes WHERE id = ?', [id]);
}

function getFoodIndex() {
    return all('SELECT id, name, estimated_time FROM recipes ORDER BY id');
}

async function createRecipe(name, ingredients, recipe, estimatedTime) {
    const result = await run(
        `INSERT INTO recipes (name, ingredients, recipe, estimated_time)
         VALUES (?, ?, ?, ?)`,
        [name, ingredients, recipe, estimatedTime]
    );
    return result.lastID;
}

async function updateRecipe(id, fields) {
    const columns = { ingredients: 'ingredients', estimated_time: 'estimated_time', recipe: 'recipe' };
    const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
    if (entries.length === 0) return 0;

    const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
    const values = entries.map(([, value]) => value);
    const result = await run(`UPDATE recipes SET ${assignments} WHERE id = ?`, [...values, id]);
    return result.changes;
}

async function deleteRecipe(name) {
    const result = await run('DELETE FROM recipes WHERE name = ?', [name]);
    return result.changes;
}

async function createRating(name, point, comment) {
    const recipe = await get('SELECT id FROM recipes WHERE name = ?', [name]);
    if (!recipe) return null;

    const result = await run(
        'INSERT INTO rates (recipe, point, comment) VALUES (?, ?, ?)',
        [recipe.id, point, comment ?? null]
    );
    return result.lastID;
}

async function deleteRating(name, rateId) {
    const result = await run(
        `DELETE FROM rates
         WHERE id = ? AND recipe = (SELECT id FROM recipes WHERE name = ?)`,
        [rateId, name]
    );
    return result.changes;
}

async function getRatingAverage(id) {
    const result = await get(
        'SELECT AVG(point) AS average, COUNT(*) AS count FROM rates WHERE recipe = ?',
        [id]
    );
    return { average: result.average, count: result.count };
}

export {
    run, get, all,
    initializeDatabase,
    getRecipe,
    getFoodIndex,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    createRating,
    deleteRating,
    getRatingAverage
};
