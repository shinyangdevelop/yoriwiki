import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else child.kill('SIGTERM');
  }
}

for (const file of ['backend/node_modules/nodemon/bin/nodemon.js', 'frontend/node_modules/vite/bin/vite.js']) {
  if (!existsSync(new URL(file, import.meta.url))) {
    console.error('Dependencies missing. Run npm run setup first.');
    process.exit(1);
  }
}

const port = process.env.PORT || '8080';
const frontendPort = process.env.FRONTEND_PORT || '5173';
const env = { ...process.env, PORT: port, BACKEND_URL: process.env.BACKEND_URL || `http://127.0.0.1:${port}` };
for (const [folder, args] of [
  ['backend', ['node_modules/nodemon/bin/nodemon.js', 'src/index.js', '--exitcrash']],
  ['frontend', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', frontendPort, '--strictPort']]
]) {
  const child = spawn(process.execPath, args, { cwd: `${root}/${folder}`, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => { console.error(error); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log(`Frontend: http://127.0.0.1:${frontendPort} | Backend: ${env.BACKEND_URL}`);
