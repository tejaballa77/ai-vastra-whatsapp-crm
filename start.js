const { spawn } = require('child_process');
const path = require('path');

console.log('===========================================================');
console.log('🚀 Starting AI Vastra CRM Workspace...');
console.log('   Backend:  http://localhost:5000');
console.log('   Frontend: http://localhost:3000');
console.log('===========================================================');

const backend = spawn('npm.cmd', ['run', 'dev'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true,
});

const frontend = spawn('npm.cmd', ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true,
});

process.on('SIGINT', () => {
  backend.kill();
  frontend.kill();
  process.exit();
});
