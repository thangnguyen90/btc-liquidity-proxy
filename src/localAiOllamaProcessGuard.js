import { spawn } from 'node:child_process';

export const LOCAL_AI_OLLAMA_PROCESS_GUARD_VERSION =
  'LOCAL_AI_OLLAMA_PROCESS_GUARD_V1_ORPHAN_ONLY_20261001';

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const positiveInteger = value => {
  const parsed = finite(value);
  return parsed != null && parsed > 0 ? Math.trunc(parsed) : null;
};

function normalizeProcess(row = {}) {
  return {
    processId: positiveInteger(row.processId ?? row.ProcessId),
    parentProcessId: positiveInteger(row.parentProcessId ?? row.ParentProcessId),
    name: String(row.name ?? row.Name ?? '').trim(),
    createdAtMs: finite(row.createdAtMs),
  };
}

export function selectOrphanedLlamaServers(rows = [], {
  now = Date.now(),
  minAgeMs = 5 * 60_000,
  maxKills = 16,
} = {}) {
  const processes = (Array.isArray(rows) ? rows : []).map(normalizeProcess)
    .filter(process => process.processId != null);
  const livePids = new Set(processes.map(process => process.processId));
  return processes
    .filter(process => process.name.toLowerCase() === 'llama-server.exe')
    .filter(process => process.parentProcessId != null && !livePids.has(process.parentProcessId))
    .filter(process => process.createdAtMs != null
      && Math.max(0, Number(now) - process.createdAtMs) >= Math.max(60_000, Number(minAgeMs) || 0))
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .slice(0, Math.max(1, Math.trunc(Number(maxKills) || 1)));
}

function runPowerShellJson(executable, script, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', script,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      const error = new Error(`PowerShell process guard timed out after ${timeoutMs}ms`);
      error.code = 'LOCAL_AI_OLLAMA_GUARD_TIMEOUT';
      reject(error);
    }, Math.max(1_000, Number(timeoutMs) || 20_000));
    timer.unref?.();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(stderr.trim() || `PowerShell process guard exited ${code}`);
        error.code = 'LOCAL_AI_OLLAMA_GUARD_POWERSHELL_FAILED';
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || 'null'));
      } catch (error) {
        error.code = 'LOCAL_AI_OLLAMA_GUARD_INVALID_JSON';
        reject(error);
      }
    });
  });
}

function windowsProcessInventoryScript() {
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$ErrorActionPreference = "Stop"',
    '$rows = @(Get-CimInstance Win32_Process | ForEach-Object {',
    '  $createdAtMs = $null',
    '  if ($_.Name -ieq "llama-server.exe" -and $null -ne $_.CreationDate) {',
    '    $createdAtMs = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()',
    '  }',
    '  [pscustomobject]@{ processId = [int]$_.ProcessId; parentProcessId = [int]$_.ParentProcessId; name = [string]$_.Name; createdAtMs = $createdAtMs }',
    '})',
    'ConvertTo-Json -Compress -Depth 3 -InputObject $rows',
  ].join('; ');
}

function windowsTerminateOrphanScript(processId) {
  const targetProcessId = positiveInteger(processId);
  if (targetProcessId == null) throw new Error('Invalid llama-server PID');
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$ErrorActionPreference = "Stop"',
    `$targetProcessId = ${targetProcessId}`,
    '$target = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $targetProcessId) -ErrorAction SilentlyContinue',
    'if ($null -eq $target -or $target.Name -ine "llama-server.exe") {',
    '  ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ processId = $targetProcessId; killed = $false; reason = "NOT_FOUND_OR_NAME_CHANGED" })',
    '  exit 0',
    '}',
    '$parent = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$target.ParentProcessId) -ErrorAction SilentlyContinue',
    'if ($null -ne $parent) {',
    '  ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ processId = $targetProcessId; killed = $false; reason = "PARENT_ALIVE"; parentProcessId = [int]$target.ParentProcessId; parentName = [string]$parent.Name })',
    '  exit 0',
    '}',
    'Stop-Process -Id $targetProcessId -Force -ErrorAction Stop',
    'ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ processId = $targetProcessId; killed = $true; reason = "ORPHAN_PARENT_MISSING"; parentProcessId = [int]$target.ParentProcessId })',
  ].join('; ');
}

export class LocalAiOllamaProcessGuard {
  constructor({
    enabled = process.env.LOCAL_AI_OLLAMA_ORPHAN_CLEANUP_ENABLED !== 'false',
    minAgeMs = Number(process.env.LOCAL_AI_OLLAMA_ORPHAN_MIN_AGE_MS ?? 5 * 60_000),
    maxKills = Number(process.env.LOCAL_AI_OLLAMA_ORPHAN_MAX_KILLS ?? 16),
    powershellExecutable = process.env.LOCAL_AI_WINDOWS_POWERSHELL_EXE
      ?? '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    inventoryProvider = null,
    orphanTerminator = null,
    now = () => Date.now(),
  } = {}) {
    this.enabled = enabled === true;
    this.minAgeMs = Math.max(60_000, Number(minAgeMs) || 5 * 60_000);
    this.maxKills = Math.max(1, Math.trunc(Number(maxKills) || 16));
    this.powershellExecutable = powershellExecutable;
    this.inventoryProvider = inventoryProvider ?? (() => runPowerShellJson(
      this.powershellExecutable,
      windowsProcessInventoryScript(),
    ));
    this.orphanTerminator = orphanTerminator ?? (processId => runPowerShellJson(
      this.powershellExecutable,
      windowsTerminateOrphanScript(processId),
    ));
    this.now = now;
    this.running = null;
    this.lastResult = null;
  }

  snapshot() {
    return {
      version: LOCAL_AI_OLLAMA_PROCESS_GUARD_VERSION,
      enabled: this.enabled,
      minAgeMs: this.minAgeMs,
      running: Boolean(this.running),
      lastResult: this.lastResult,
    };
  }

  async cleanup({ dryRun = false } = {}) {
    if (!this.enabled) return { enabled: false, dryRun, inspected: 0, candidates: [], killed: [] };
    if (this.running) return this.running;
    this.running = (async () => {
      const checkedAt = this.now();
      const inventory = await this.inventoryProvider();
      const rows = Array.isArray(inventory) ? inventory : inventory ? [inventory] : [];
      const candidates = selectOrphanedLlamaServers(rows, {
        now: checkedAt,
        minAgeMs: this.minAgeMs,
        maxKills: this.maxKills,
      });
      const results = [];
      if (!dryRun) {
        for (const candidate of candidates) {
          // The Windows-side command re-reads both target and parent immediately
          // before Stop-Process, closing the inventory/kill race safely.
          results.push(await this.orphanTerminator(candidate.processId));
        }
      }
      const killed = results.filter(result => result?.killed === true).map(result => result.processId);
      const result = {
        version: LOCAL_AI_OLLAMA_PROCESS_GUARD_VERSION,
        enabled: true,
        dryRun,
        checkedAt,
        inspected: rows.length,
        candidates: candidates.map(process => process.processId),
        killed,
        skipped: results.filter(result => result?.killed !== true),
      };
      this.lastResult = result;
      return result;
    })();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }
}
