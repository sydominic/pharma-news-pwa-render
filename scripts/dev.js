import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function run(name, args) {
  const child = spawn(npmCmd, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env }
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
  });
  return child;
}

const server = run('server', ['--prefix', 'server', 'run', 'dev']);
const client = run('client', ['--prefix', 'client', 'run', 'dev']);

function shutdown() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
