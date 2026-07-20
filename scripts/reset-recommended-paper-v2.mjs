import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve('data/recommended-paper-trades.json');
const payload = {
  version: 2,
  paperMode: 'INDEPENDENT_SOCKET_V2',
  resetAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  trades: [],
};

await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Reset derived Recommended Paper log to V2: ${target}`);
