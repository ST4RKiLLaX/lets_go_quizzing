import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type TempCwdHarness = {
  prepare: () => string;
  cleanup: () => void;
  getTempDir: () => string | null;
};

export function createTempCwdHarness(prefix: string): TempCwdHarness {
  const originalCwd = process.cwd();
  let tempDir: string | null = null;

  return {
    prepare() {
      tempDir = mkdtempSync(join(tmpdir(), prefix));
      process.chdir(tempDir);
      return tempDir;
    },
    cleanup() {
      process.chdir(originalCwd);
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
      }
    },
    getTempDir() {
      return tempDir;
    },
  };
}
