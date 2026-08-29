import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRecord, isValidRecord, normalizeRecordToCurrentSchema } from './record.js';
import { IncidentStatus, RecoveryAttemptStatus } from './state.js';
import { computeFingerprint } from './fingerprint.js';
import { evaluateStaleness } from './staleness.js';
import { extractNegativeMemory } from './negative_memory.js';
import { analyzeEvidenceConflicts } from './contradiction.js';
import { CliError } from '../errors.js';

/**
 * Normalizes an incident ID string by stripping common prefixes like "#", "RW-", or "rw-".
 *
 * @param {string|number} id
 * @returns {string}
 */
export function normalizeId(id) {
  if (id === null || id === undefined) return '';
  return String(id).replace(/^(?:RW-|#)/i, '').trim();
}

export class StorageEngine {
  /**
   * @param {string} ledgerDir - Path to .rewind directory
   */
  constructor(ledgerDir) {
    this.ledgerDir = path.resolve(ledgerDir);
    this.recordsDir = path.join(this.ledgerDir, 'records');
    this.tmpDir = path.join(this.ledgerDir, 'tmp');
    this.quarantineDir = path.join(this.ledgerDir, 'quarantine');

    /** @type {Map<string, import('./record.js').IncidentRecord>} */
    this.index = new Map();
    this.highestId = 0;
    /** @type {Array<{ file: string, reason: string, quarantinedAt: string }>} */
    this.quarantined = [];
    this.initialized = false;
  }

  /**
   * Initializes the storage directory layout, cleans orphan temp files,
   * quarantines any corrupt JSON files, and rebuilds the in-memory index.
   */
  init() {
    // 1. Ensure directory hierarchy exists with secure permissions (0o700)
    fs.mkdirSync(this.ledgerDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.recordsDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.tmpDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.quarantineDir, { recursive: true, mode: 0o700 });

    // 2. Clean orphaned temporary files in tmpDir
    this.cleanOrphanedTempFiles();

    // 3. Scan and load records, quarantining corrupt files
    this.rebuildIndex();

    this.initialized = true;
    return this;
  }

  /**
   * Safely deletes orphaned .tmp files left over from crashes or aborted writes.
   */
  cleanOrphanedTempFiles() {
    try {
      const files = fs.readdirSync(this.tmpDir);
      for (const file of files) {
        if (file.endsWith('.tmp')) {
          try {
            fs.unlinkSync(path.join(this.tmpDir, file));
          } catch {
            // Ignore failure to delete individual temp file
          }
        }
      }
    } catch {
      // Directory read failed
    }
  }

  /**
   * Scans records directory, quarantines any corrupt or malformed files,
   * normalizes schemas to the current architecture, and rebuilds the in-memory index.
   */
  rebuildIndex() {
    this.index.clear();
    this.highestId = 0;
    this.quarantined = [];

    let filenames = [];
    try {
      filenames = fs.readdirSync(this.recordsDir);
    } catch {
      return;
    }

    for (const filename of filenames) {
      const filePath = path.join(this.recordsDir, filename);

      // Handle stray temp files in records dir
      if (filename.endsWith('.tmp')) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore
        }
        continue;
      }

      if (!filename.endsWith('.json')) {
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (readErr) {
        this.quarantineFile(filePath, filename, `Unreadable file: ${readErr.message}`);
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        this.quarantineFile(filePath, filename, `Malformed JSON: ${parseErr.message}`);
        continue;
      }

      if (!isValidRecord(parsed)) {
        this.quarantineFile(filePath, filename, 'Schema validation failed: missing required fields');
        continue;
      }

      // Valid record: normalize to current schema and store in memory
      const normalized = normalizeRecordToCurrentSchema(parsed);
      this.index.set(normalized.id, normalized);

      const numId = Number.parseInt(normalized.id, 10);
      if (!Number.isNaN(numId) && numId > this.highestId) {
        this.highestId = numId;
      }
    }
  }

  /**
   * Quarantines a corrupted file by moving it out of records/ into quarantine/
   *
   * @param {string} filePath
   * @param {string} filename
   * @param {string} reason
   */
  quarantineFile(filePath, filename, reason) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const quarantineName = `${timestamp}_${filename}`;
    const targetPath = path.join(this.quarantineDir, quarantineName);

    try {
      fs.renameSync(filePath, targetPath);
      this.quarantined.push({
        file: quarantineName,
        reason,
        quarantinedAt: new Date().toISOString()
      });
    } catch {
      // If rename fails, try delete to prevent infinite crash loops
    }
  }

  /**
   * Calculates the next unique sequential record ID.
   *
   * @returns {string}
   */
  getNextId() {
    return String(this.highestId + 1);
  }

  /**
   * Finds all records with an exact matching fingerprint.
   *
   * @param {string} fingerprint
   * @returns {Array<import('./record.js').IncidentRecord>}
   */
  findByFingerprint(fingerprint) {
    if (!fingerprint) return [];
    const matches = [];
    for (const record of this.index.values()) {
      if (record.fingerprint === fingerprint) {
        matches.push(record);
      }
    }
    return matches.sort((a, b) => Number(b.id) - Number(a.id));
  }

  /**
   * Searches for a prior record that reached the RECOVERED / VERIFIED state with the same fingerprint.
   *
   * @param {string} fingerprint
   * @returns {import('./record.js').IncidentRecord|null}
   */
  findVerifiedByFingerprint(fingerprint) {
    if (!fingerprint) return null;
    let latestVerified = null;

    for (const record of this.index.values()) {
      const isRecovered = record.status === IncidentStatus.RECOVERED || record.status === 'VERIFIED';
      if (record.fingerprint === fingerprint && isRecovered) {
        if (!latestVerified || Number(record.id) > Number(latestVerified.id)) {
          latestVerified = record;
        }
      }
    }
    return latestVerified;
  }

  /**
   * Saves a command capture result as an immutable record on disk using
   * crash-safe atomic write (write tmp -> fsync -> rename) with 0o600 permissions.
   * Automatically detects regressions if matching a previously verified failure.
   *
   * @param {import('../capture.js').CaptureRecord} captureResult
   * @param {object} [options]
   * @returns {import('./record.js').IncidentRecord}
   */
  saveRecord(captureResult, options = {}) {
    if (!this.initialized) {
      this.init();
    }

    const id = this.getNextId();

    // Check for regression against previously verified records
    let initialState = options.initialState;
    let regressionOf = options.regressionOf || null;

    if (!captureResult.success && !initialState) {
      const { fingerprint } = computeFingerprint({
        command: captureResult.command,
        args: captureResult.args,
        exitCode: captureResult.exitCode,
        signal: captureResult.signal,
        stderr: captureResult.stderr,
        stdout: captureResult.stdout
      });

      const priorVerified = this.findVerifiedByFingerprint(fingerprint);
      if (priorVerified) {
        initialState = IncidentStatus.REGRESSED;
        regressionOf = priorVerified.id;
      } else {
        initialState = IncidentStatus.OBSERVED;
      }
    }

    const record = createRecord(id, captureResult, {
      initialState,
      regressionOf
    });

    const jsonContent = JSON.stringify(record, null, 2);

    // 1. Write to temporary file with unique UUID in tmp directory with strict permissions
    const tempFilename = `${id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.tmp`;
    const tempFilePath = path.join(this.tmpDir, tempFilename);

    const fd = fs.openSync(tempFilePath, 'w', 0o600);
    try {
      fs.writeSync(fd, jsonContent);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // 2. Atomically rename temporary file to destination record path
    const destinationPath = path.join(this.recordsDir, `${id}.json`);
    fs.renameSync(tempFilePath, destinationPath);

    // 3. Update in-memory index
    this.index.set(id, record);
    const numId = Number.parseInt(id, 10);
    if (!Number.isNaN(numId) && numId > this.highestId) {
      this.highestId = numId;
    }

    return record;
  }

  /**
   * Atomically updates an existing record on disk and in memory.
   *
   * @param {string|number} id
   * @param {(current: import('./record.js').IncidentRecord) => import('./record.js').IncidentRecord} updaterFn
   * @returns {import('./record.js').IncidentRecord}
   */
  updateRecord(id, updaterFn) {
    if (!this.initialized) {
      this.init();
    }

    const strId = normalizeId(id);
    if (!/^\d+$/.test(strId)) {
      throw new CliError(`Invalid incident ID format: "${id}". Incident IDs must be positive integers.`, {
        code: 'ERR_INVALID_ID',
        exitCode: 1,
        details: { suggestion: 'Run "rewind history" to browse all past incidents.' }
      });
    }

    const existing = this.getRecord(strId);
    if (!existing) {
      throw new CliError(`Incident #${strId} not found in ledger.`, {
        code: 'ERR_NOT_FOUND',
        exitCode: 1,
        details: { id: strId, suggestion: 'Run "rewind history" to browse all past incidents.' }
      });
    }

    const updated = updaterFn(existing);
    if (!isValidRecord(updated)) {
      throw new CliError(`Record update failed schema validation for Incident #${strId}.`, { code: 'ERR_VALIDATION' });
    }

    const normalized = normalizeRecordToCurrentSchema(updated);
    const frozen = Object.freeze(normalized);
    const jsonContent = JSON.stringify(frozen, null, 2);

    // 1. Atomic write to tmp with 0o600 permissions
    const tempFilename = `${strId}_update_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.tmp`;
    const tempFilePath = path.join(this.tmpDir, tempFilename);

    const fd = fs.openSync(tempFilePath, 'w', 0o600);
    try {
      fs.writeSync(fd, jsonContent);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // 2. Atomic rename
    const destinationPath = path.join(this.recordsDir, `${strId}.json`);
    fs.renameSync(tempFilePath, destinationPath);

    // 3. Update in-memory index
    this.index.set(strId, frozen);

    return frozen;
  }

  /**
   * Appends a new recovery attempt to an incident record.
   *
   * @param {string|number} id
   * @param {object} attemptData
   * @param {string|null} [attemptData.cause]
   * @param {string|null} [attemptData.change]
   * @param {string|null} [attemptData.verifyCmd]
   * @returns {import('./record.js').IncidentRecord}
   */
  addRecoveryAttempt(id, attemptData) {
    return this.updateRecord(id, (current) => {
      const currentAttempts = Array.isArray(current.recoveryAttempts) ? current.recoveryAttempts : [];
      const newAttemptId = currentAttempts.length + 1;

      const newAttempt = {
        id: newAttemptId,
        createdAt: new Date().toISOString(),
        cause: attemptData.cause || null,
        change: attemptData.change || null,
        verifyCmd: attemptData.verifyCmd || null,
        status: RecoveryAttemptStatus.PROPOSED,
        verificationRuns: []
      };

      return {
        ...current,
        status: IncidentStatus.OPEN,
        recoveryAttempts: [...currentAttempts, newAttempt]
      };
    });
  }

  /**
   * Records a verification execution run on a specific recovery attempt.
   *
   * @param {string|number} id
   * @param {number} attemptId
   * @param {object} runData
   * @param {string} runData.command
   * @param {number} runData.exitCode
   * @param {number} runData.durationMs
   * @param {string} runData.output
   * @param {string} [runData.environmentFingerprint]
   * @returns {import('./record.js').IncidentRecord}
   */
  recordVerificationRun(id, attemptId, runData) {
    return this.updateRecord(id, (current) => {
      const currentAttempts = Array.isArray(current.recoveryAttempts) ? [...current.recoveryAttempts] : [];
      const attemptIndex = currentAttempts.findIndex(a => a.id === attemptId);

      if (attemptIndex === -1) {
        throw new CliError(`Attempt #${attemptId} not found in Incident #${id}.`);
      }

      const targetAttempt = { ...currentAttempts[attemptIndex] };
      const currentRuns = Array.isArray(targetAttempt.verificationRuns) ? targetAttempt.verificationRuns : [];
      const newRunId = currentRuns.length + 1;
      const isPassed = runData.exitCode === 0;

      const newRun = {
        id: newRunId,
        startedAt: new Date(Date.now() - (runData.durationMs || 0)).toISOString(),
        completedAt: new Date().toISOString(),
        command: runData.command,
        exitCode: runData.exitCode,
        durationMs: runData.durationMs || 0,
        output: runData.output || '',
        outputHash: crypto.createHash('sha256').update(runData.output || '', 'utf8').digest('hex'),
        environmentFingerprint: runData.environmentFingerprint || current.environment?.fingerprint || '',
        result: isPassed ? 'PASSED' : 'FAILED'
      };

      targetAttempt.status = isPassed ? RecoveryAttemptStatus.VERIFIED : RecoveryAttemptStatus.FAILED;
      targetAttempt.verificationRuns = [...currentRuns, newRun];
      currentAttempts[attemptIndex] = targetAttempt;

      const updatedIncidentStatus = isPassed ? IncidentStatus.RECOVERED : current.status;

      return {
        ...current,
        status: updatedIncidentStatus,
        recoveryAttempts: currentAttempts
      };
    });
  }

  /**
   * Evaluates staleness of a historical record against the current environment.
   *
   * @param {string|number} id
   * @param {import('../environment.js').EnvironmentSnapshot} [currentEnv]
   * @param {import('../git.js').GitMetadata} [currentGit]
   * @returns {import('./staleness.js').StalenessEvaluation}
   */
  getStalenessReport(id, currentEnv, currentGit) {
    const record = this.getRecord(id);
    return evaluateStaleness(record, currentEnv, currentGit);
  }

  /**
   * Retrieves all failed remediation attempts for a failure fingerprint.
   *
   * @param {string} fingerprint
   * @returns {import('./negative_memory.js').FailedApproach[]}
   */
  getNegativeMemory(fingerprint) {
    const matching = this.findByFingerprint(fingerprint);
    return extractNegativeMemory(matching);
  }

  /**
   * Detects conflicting or divergent verification evidence for a failure fingerprint.
   *
   * @param {string} fingerprint
   * @returns {import('./contradiction.js').EvidenceConflictReport}
   */
  getContradictionReport(fingerprint) {
    const matching = this.findByFingerprint(fingerprint);
    return analyzeEvidenceConflicts(fingerprint, matching);
  }

  /**
   * Retrieves a record by ID from the in-memory index.
   * Strictly validates numeric ID to prevent path traversal attempts.
   *
   * @param {string|number} id
   * @returns {import('./record.js').IncidentRecord|null}
   */
  getRecord(id) {
    if (!this.initialized) {
      this.init();
    }
    const strId = normalizeId(id);
    if (!/^\d+$/.test(strId)) {
      return null;
    }
    return this.index.get(strId) || null;
  }

  /**
   * Returns all stored records sorted by numeric ID / creation order.
   *
   * @returns {Array<import('./record.js').IncidentRecord>}
   */
  listRecords() {
    if (!this.initialized) {
      this.init();
    }
    return Array.from(this.index.values()).sort((a, b) => {
      const idA = Number.parseInt(a.id, 10);
      const idB = Number.parseInt(b.id, 10);
      if (!Number.isNaN(idA) && !Number.isNaN(idB)) {
        return idA - idB;
      }
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Returns list of any files quarantined during startup.
   *
   * @returns {Array<{ file: string, reason: string, quarantinedAt: string }>}
   */
  getQuarantined() {
    return [...this.quarantined];
  }
}

