import assert from 'node:assert/strict';
import { moveFileWithCrossDeviceFallback } from '../src/fileMove.js';

{
  const calls = [];
  const result = await moveFileWithCrossDeviceFallback('a', 'b', {
    renameFile: async (...args) => calls.push(['rename', ...args]),
    copyFileToDestination: async (...args) => calls.push(['copy', ...args]),
    unlinkSource: async (...args) => calls.push(['unlink', ...args]),
  });
  assert.equal(result.method, 'rename');
  assert.deepEqual(calls, [['rename', 'a', 'b']]);
}

{
  const calls = [];
  const result = await moveFileWithCrossDeviceFallback('a', 'b', {
    renameFile: async (...args) => {
      calls.push(['rename', ...args]);
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    },
    copyFileToDestination: async (...args) => calls.push(['copy', ...args]),
    unlinkSource: async (...args) => calls.push(['unlink', ...args]),
  });
  assert.equal(result.method, 'copy-unlink');
  assert.deepEqual(calls, [
    ['rename', 'a', 'b'],
    ['copy', 'a', 'b'],
    ['unlink', 'a'],
  ]);
}

{
  const calls = [];
  await assert.rejects(() => moveFileWithCrossDeviceFallback('a', 'b', {
    renameFile: async () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }); },
    copyFileToDestination: async (...args) => {
      calls.push(['copy', ...args]);
      throw new Error('destination full');
    },
    unlinkSource: async (...args) => calls.push(['unlink', ...args]),
  }), /destination full/);
  assert.deepEqual(calls, [['copy', 'a', 'b']], 'source must remain when copy fails');
}

console.log('cross-device file move: OK');
