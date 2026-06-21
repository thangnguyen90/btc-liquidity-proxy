import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const envPath = join(rootDir, '.env');

export function loadEnv() {
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = stripInlineComment(trimmed.slice(separatorIndex + 1)).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function stripInlineComment(value) {
  let quote = null;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const prev = value[i - 1];

    if ((ch === '"' || ch === "'") && prev !== '\\') {
      quote = quote === ch ? null : quote ?? ch;
      continue;
    }

    if (ch === '#' && quote === null) {
      return value.slice(0, i);
    }
  }

  return value;
}
