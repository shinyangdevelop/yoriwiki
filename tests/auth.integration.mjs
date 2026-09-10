import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:15173';
// HTTP is the proxy-to-Vite transport; the browser can have an HTTPS origin.
const browserOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : origin;
const prefix = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const base = origin + prefix;
const env = { ...process.env, BASE_PATH: prefix, NODE_ENV: 'development', PORT: '18080', DATABASE_PATH: ':memory:', BACKEND_URL: 'http://127.0.0.1:18080' };
const children = [];
let serverOutput = '';
async function request(path, body, cookie = '', requestOrigin = browserOrigin, method) {
  return fetch(`${base}/api/auth/${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', origin: requestOrigin, cookie },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
try {
  // Refuse to reuse another application's ports.
  for (const url of [base, env.BACKEND_URL]) {
    let occupied = false;
    try { await fetch(url); occupied = true; } catch {}
    assert.equal(occupied, false, `Test port occupied: ${url}`);
  }
  for (const [cwd, args] of [
    ['backend', ['src/index.js']],
    ['frontend', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15173', '--strictPort']]
  ]) {
    const child = spawn(process.execPath, args, { cwd: `${root}/${cwd}`, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-12000); });
    child.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-12000); });
    child.on('error', error => { serverOutput += error.message; });
    children.push(child);
  }
  let ready = false;
  for (let i = 0; i < 240; i++) {
    try { ready = (await fetch(`${base}/api/test`)).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Servers did not start:\n${serverOutput}`);
  for (const rejectedOrigin of ['', 'null', 'https://other.example']) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(rejectedOrigin ? { origin: rejectedOrigin } : {}),
        'x-forwarded-host': 'other.example',
        'x-forwarded-proto': 'https'
      },
      body: '{}'
    });
    assert.equal(response.status, 403, 'Missing/foreign origins and forged forwarding headers must be rejected');
  }
  for (const path of ['', '/login', '/signup', '/recipes', '/search', '/profile', '/recipes/new', '/community/write']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path || '/');
    const html = await response.text();
    for (const [, target] of html.matchAll(/(?:href|action)="(\/(?!\/)[^"]*)"/g)) {
      if (prefix) assert.ok(target === prefix || target.startsWith(prefix + '/') || target.startsWith(prefix + '?'), `Unprefixed public link: ${target}`);
      if (prefix) assert.ok(!target.startsWith(prefix + prefix + '/'), `Double prefix: ${target}`);
    }
    assert.ok(html.includes(`href="${prefix}/login"`), 'SSR navigation must include public login path');
    if (!path) {
      assert.ok(html.includes(`action="${prefix}/search"`));
      assert.ok(html.includes(`href="${prefix}/recipes?sort=recent"`));
    }
  }
  if (prefix) assert.notEqual((await fetch(origin + '/api/auth/me', { redirect: 'manual' })).status, 401);
  const input = { email: ' Test@Example.com ', nickname: '검증사용자', password: 'TestPass123', passwordConfirm: 'TestPass123', agreeTerms: true, agreePrivacy: true };
  assert.equal((await request('signup', input, '', 'https://other.example')).status, 403);
  for (const patch of [{ email: 'invalid' }, { nickname: '!' }, { password: 'short' }, { passwordConfirm: 'wrong' }, { agreeTerms: false }, { agreePrivacy: 'true' }]) {
    assert.equal((await request('signup', { ...input, ...patch })).status, 400);
  }
  assert.deepEqual(await (await request('check-email', { email: input.email })).json(), { available: true });
  let response = await request('signup', input);
  assert.equal(response.status, 201);
  const { user } = await response.json();
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'nickname']);
  assert.equal(user.email, 'test@example.com');
  assert.equal((await request('signup', input)).status, 409);
  assert.equal((await request('signup', { ...input, email: 'second@example.com' })).status, 409);
  assert.deepEqual(await (await request('check-email', { email: input.email })).json(), { available: false });
  assert.equal((await request('login', { email: input.email, password: 'Wrong123' })).status, 401);
  assert.equal((await request('me')).status, 401);
  response = await request('login', { email: input.email, password: input.password, rememberMe: true });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Max-Age=2592000/);
  const cookie = setCookie.split(';')[0];
  assert.deepEqual((await (await request('me', undefined, cookie)).json()).user, user);
  const html = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert.ok(html.includes('검증사용자님'), 'SSR header must reflect authenticated user');
  // A single disposable record exercises authenticated experience persistence.
  const foodResponse = await fetch(`${base}/api/food`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'integration-fixture', ingredients: '-', recipe: '-', estimated_time: '1분' }) });
  assert.equal(foodResponse.status, 201);
  const recipeId = await foodResponse.json();
  assert.equal((await fetch(`${base}/recipes/${recipeId}`)).status, 200);
  const searchHtml = await (await fetch(`${base}/search?q=integration-fixture`)).text();
  assert.ok(searchHtml.includes(`href="${prefix}/recipes/${recipeId}"`), 'Search must render a base-aware dynamic recipe URL');
  assert.ok(searchHtml.includes(`action="${prefix}/search"`), 'Search preserves its public pathname');
  assert.equal((await request('cooked')).status, 401);
  assert.equal((await request('cooked', { recipeId, cooked: true }, '', browserOrigin, 'PUT')).status, 401);
  assert.equal((await request('cooked', { recipeId, cooked: true }, cookie, 'https://other.example', 'PUT')).status, 403);
  assert.equal((await request('cooked', { recipeId, cooked: 'true' }, cookie, browserOrigin, 'PUT')).status, 400);
  assert.equal((await request('cooked', { recipeId: 999999, cooked: true }, cookie, browserOrigin, 'PUT')).status, 404);
  for (let i = 0; i < 2; i++) assert.equal((await request('cooked', { recipeId, cooked: true }, cookie, browserOrigin, 'PUT')).status, 200);
  assert.deepEqual(await (await request('cooked', undefined, cookie)).json(), { ids: [recipeId] });
  assert.equal((await request('signup', { ...input, email: 'isolated@example.com', nickname: '별도사용자' })).status, 201);
  const secondLogin = await request('login', { email: 'isolated@example.com', password: input.password });
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await request('cooked', undefined, secondCookie)).json(), { ids: [] });
  const catalog = await (await fetch(`${base}/api/explore`)).json();
  assert.equal(catalog.recipes[0].id, recipeId);
  assert.equal(catalog.recipes[0].metadata.step_count, null);
  assert.equal((await request('cooked', { recipeId, cooked: false }, cookie, browserOrigin, 'PUT')).status, 200);
  assert.deepEqual(await (await request('cooked', undefined, cookie)).json(), { ids: [] });
  for (const path of ['/search', '/profile']) assert.equal((await fetch(base + path, { headers: { cookie } })).status, 200);
  response = await request('logout', {}, cookie);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await request('me', undefined, cookie)).status, 401);
  response = await request('login', { email: input.email, password: input.password, rememberMe: false });
  assert.equal(response.status, 200);
  assert.ok(!response.headers.get('set-cookie').includes('Max-Age'));
  for (const path of ['/signup', '/login?registered=1']) assert.equal((await fetch(base + path)).status, 200);
  console.log(`PASS (${prefix || '/'}): public links/forms, dynamic recipes, API proxy, auth, CSRF, cooked persistence, account isolation and SSR`);
} finally {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}
