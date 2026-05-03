#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function getBinaryPath() {
  const platform = os.platform();
  const arch = os.arch();
  
  const pkgName = `@astrake/xia-${platform}-${arch}`;
  
  // Try to resolve the binary from optionalDependencies
  try {
    const pkgPath = require.resolve(`${pkgName}/package.json`);
    const pkgDir = path.dirname(pkgPath);
    const binName = platform === 'win32' ? 'xia.exe' : 'xia';
    const binPath = path.join(pkgDir, 'bin', binName);
    
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  } catch (e) {
    // Fallthrough to development mode check
  }

  // Development mode: fallback to bun run if inside the repo
  const devCliPath = path.join(__dirname, '..', 'cli', 'main.ts');
  
  if (fs.existsSync(devCliPath)) {
    console.log('Running in development mode via Bun (cli/main.ts)');
    return 'bun';
  }

  throw new Error(`Failed to locate binary for your platform (${platform}-${arch}) in optionalDependencies.`);
}

try {
  const binaryPath = getBinaryPath();
  const args = binaryPath === 'bun' ? [path.join(__dirname, '..', fs.existsSync(path.join(__dirname, '..', 'src', 'main.ts')) ? 'src/main.ts' : 'apps/cli/index.ts'), ...process.argv.slice(2)] : process.argv.slice(2);
  
  execFileSync(binaryPath, args, { stdio: 'inherit' });
} catch (err) {
  if (err.status) {
    process.exit(err.status);
  }
  console.error(err.message);
  process.exit(1);
}
