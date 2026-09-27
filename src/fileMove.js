import { copyFile, rename, unlink } from 'node:fs/promises';

export const CROSS_DEVICE_FILE_MOVE_VERSION = 'CROSS_DEVICE_FILE_MOVE_V1_20260922';

export async function moveFileWithCrossDeviceFallback(source, destination, {
  renameFile = rename,
  copyFileToDestination = copyFile,
  unlinkSource = unlink,
} = {}) {
  try {
    await renameFile(source, destination);
    return { method: 'rename', version: CROSS_DEVICE_FILE_MOVE_VERSION };
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
  }

  // copyFile leaves the source intact on failure. Only unlink after the full
  // destination copy succeeds, so a cross-filesystem archive remains
  // recoverable if the process or destination disk fails midway.
  await copyFileToDestination(source, destination);
  await unlinkSource(source);
  return { method: 'copy-unlink', version: CROSS_DEVICE_FILE_MOVE_VERSION };
}
