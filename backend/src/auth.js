import { Router } from 'express';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { run, get, all } from './database.js';

const scrypt = promisify(scryptCallback);
export const auth = Router();
const emailValue = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = ({ id, email, nickname }) => ({ id, email, nickname });
const tokenFrom = (req) => /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };

// Bound password hashing work and repeated credential attempts per client.
const attempts = new Map();
auth.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET' && ['/me', '/cooked'].includes(req.path)) return next();
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 60000 };
    attempts.set(key, entry);
    if (++entry.count > 30) return res.status(429).send('요청이 너무 많습니다. 1분 후 다시 시도해주세요.');
    next();
});

auth.post('/check-email', async (req, res) => {
    const email = emailValue(req.body?.email);
    if (!validEmail(email)) return res.status(400).send('올바른 이메일을 입력해주세요.');
    res.json({ available: !await get('SELECT id FROM users WHERE email = ?', [email]) });
});

auth.post('/signup', async (req, res) => {
    const { password, passwordConfirm, agreeTerms, agreePrivacy } = req.body ?? {};
    const email = emailValue(req.body?.email);
    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim().normalize('NFC') : '';
    if (!validEmail(email)) return res.status(400).send('올바른 이메일을 입력해주세요.');
    if (!/^[가-힣a-zA-Z0-9]{2,20}$/.test(nickname)) return res.status(400).send('닉네임은 2~20자의 한글, 영문, 숫자여야 합니다.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).send('비밀번호는 8~128자이며 영문과 숫자를 포함해야 합니다.');
    }
    if (password !== passwordConfirm) return res.status(400).send('비밀번호 확인이 일치하지 않습니다.');
    if (agreeTerms !== true || agreePrivacy !== true) return res.status(400).send('필수 약관에 모두 동의해주세요.');
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    const now = new Date().toISOString();
    try {
        const { lastID } = await run('INSERT INTO users (email, nickname, password_hash, terms_accepted_at, privacy_accepted_at) VALUES (?, ?, ?, ?, ?)', [email, nickname, `${salt}:${hash}`, now, now]);
        res.status(201).json({ user: { id: lastID, email, nickname } });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).send('이미 사용 중인 이메일 또는 닉네임입니다.');
        throw error;
    }
});

auth.post('/login', async (req, res) => {
    const email = emailValue(req.body?.email);
    const { password, rememberMe } = req.body ?? {};
    if (!validEmail(email) || typeof password !== 'string' || password.length > 128) return res.status(400).send('이메일과 비밀번호를 확인해주세요.');
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    const [salt, stored] = user?.password_hash.split(':') || ['missing-user-salt', '00'.repeat(64)];
    const actual = await scrypt(password, salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(stored, 'hex')) || !user) return res.status(401).send('이메일 또는 비밀번호가 올바르지 않습니다.');
    const token = randomBytes(32).toString('hex');
    const duration = (rememberMe === true ? 30 : 1) * 86400000;
    await run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
    const previous = tokenFrom(req);
    if (previous) await run('DELETE FROM sessions WHERE token_hash = ?', [digest(previous)]);
    await run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [digest(token), user.id, Date.now() + duration]);
    res.cookie('session', token, { ...cookieOptions, ...(rememberMe === true ? { maxAge: duration } : {}) });
    res.json({ user: publicUser(user) });
});

auth.get('/me', async (req, res) => {
    const token = tokenFrom(req);
    const user = token ? await get('SELECT users.id, email, nickname FROM users JOIN sessions ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?', [digest(token), Date.now()]) : null;
    if (!user) return res.status(401).send('로그인이 필요합니다.');
    res.json({ user: publicUser(user) });
});

auth.post('/logout', async (req, res) => {
    const token = tokenFrom(req);
    if (token) await run('DELETE FROM sessions WHERE token_hash = ?', [digest(token)]);
    res.clearCookie('session', cookieOptions);
    res.json({ success: true });
});

auth.use('/cooked', async (req, res, next) => {
    const token = tokenFrom(req);
    const session = token && await get('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?', [digest(token), Date.now()]);
    if (!session) return res.status(401).send('로그인이 필요합니다.');
    res.locals.userId = session.user_id;
    next();
});
auth.get('/cooked', async (req, res) => {
    const rows = await all('SELECT recipe_id FROM cooked_recipes WHERE user_id = ? ORDER BY recipe_id', [res.locals.userId]);
    res.json({ ids: rows.map((row) => row.recipe_id) });
});
auth.put('/cooked', async (req, res) => {
    const { recipeId, cooked } = req.body ?? {};
    if (!Number.isSafeInteger(recipeId) || recipeId < 1 || typeof cooked !== 'boolean') return res.status(400).send('요리 ID와 조리 완료 여부가 필요합니다.');
    if (!await get('SELECT id FROM recipes WHERE id = ?', [recipeId])) return res.status(404).send('요리를 찾을 수 없습니다.');
    if (cooked) await run('INSERT OR IGNORE INTO cooked_recipes (user_id, recipe_id) VALUES (?, ?)', [res.locals.userId, recipeId]);
    else await run('DELETE FROM cooked_recipes WHERE user_id = ? AND recipe_id = ?', [res.locals.userId, recipeId]);
    res.json({ recipeId, cooked });
});
