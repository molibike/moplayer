import { spawn } from 'node:child_process';

const processes = [];

const start = (command, args, name) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] 退出，状态码: ${code}`);
      shutdown(code);
    }
  });

  processes.push(child);
};

const shutdown = (code = 0) => {
  for (const child of processes) {
    try {
      child.kill();
    } catch {}
  }
  process.exit(code);
};

start('npm', ['run', 'dev:music'], 'music-server');
start('npm', ['run', 'dev'], 'vite');

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
