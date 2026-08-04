const { spawn } = require('child_process');
const path = require('path');

console.log('===========================================================');
console.log('🚀 Starting AI Vastra CRM Workspace...');
console.log('   Backend:  http://localhost:5000');
console.log('   Frontend: http://localhost:3010');
console.log('===========================================================');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const backend = spawn(npmCmd, ['start'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true,
});

const frontend = spawn(npmCmd, ['start'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true,
});

process.on('SIGINT', () => {
  backend.kill();
  frontend.kill();
  process.exit();
});
