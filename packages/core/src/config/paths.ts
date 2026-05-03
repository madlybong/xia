import * as os from 'node:os';
import * as path from 'node:path';

export function getXiaDataDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'xia');
  } else if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'xia');
  } else {
    // Linux and others
    return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'xia');
  }
}

export function getConfigDir(): string {
  return path.join(getXiaDataDir(), 'config');
}

export function getSecretsDir(): string {
  return path.join(getXiaDataDir(), 'secrets');
}

export function getDataDir(): string {
  return path.join(getXiaDataDir(), 'data');
}

export function getLogsDir(): string {
  return path.join(getXiaDataDir(), 'logs');
}
