import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRecord, isValidRecord, normalizeRecordToCurrentSchema, boundOutput } from './record.js';
import { IncidentStatus, RecoveryAttemptStatus } from './state.js';
import { computeFingerprint } from './fingerprint.js';
import { evaluateStaleness } from './staleness.js';
import { extractNegativeMemory } from './negative_memory.js';
import { analyzeEvidenceConflicts } from './contradiction.js';
import {
  GENESIS_HASH,
  appendJournalEvent,
  readJournalEvents,
  readCheckpoint,
  writeCheckpoint,
  saveEvidenceArtifact
} from './journal.js';
import { projectEventsToRecords, writeProjectedRecords } from './projection.js';
import { verifyLedgerIntegrity } from './integrity.js';
import { analyzePatternsFromJournal } from './patterns.js';
import { buildAgentContext } from './context.js';
import { runDoctorDiagnostics, executeDoctorRepair } from './doctor.js';
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
    this.evidenceDir = path.join(this.ledgerDir, 'evidence');
    this.tmpDir = path.join(this.ledgerDir, 'tmp');
    this.quarantineDir = path.join(this.ledgerDir, 'quarantine');
    this.journalPath = path.join(this.ledgerDir, 'journal.jsonl');

    /** @type {Map<string, import('./record.js').IncidentRecord>} */
    this.index = new Map();
    /** @type {Map<string, Array<import('./record.js').IncidentRecord>>} */
    this.fingerprintIndex = new Map();
    this.highestId = 0;
    /** @type {Array<{ file: string, reason: string, quarantinedAt: string }>} */
    this.quarantined = [];
    this.initialized = false;
  }

  /**
   * Initializes the storage directory layout, cleans orphan temp files,
   * replays the authoritative journal, and syncs derived projections.
   */
  init() {
    // 1. Ensure directory hierarchy exists with secure permissions (0o700)
    fs.mkdirSync(this.ledgerDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.recordsDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.evidenceDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.tmpDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.quarantineDir, { recursive: true, mode: 0o700 });

    // 2. Clean orphaned temporary files in tmpDir
    this.cleanOrphanedTempFiles();

    // 3. Scan and replay authoritative journal, rebuilding projections
    this.rebuildIndex();

    this.initialized = true;
    return this;
  }

  /**
   * Safely deletes orphaned .tmp files left over from crashes or aborted writes.
   */
  cleanOrphanedTempFiles() {
    try {
      if (fs.existsSync(this.tmpDir)) {
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
      }
    } catch {
      // Directory read failed
    }
  }

  rebuildIndex(options = {}) {
    const forceSyncDisk = Boolean(options.syncDisk);
    this.index.clear();
    this.fingerprintIndex.clear();
    this.highestId = 0;
    this.quarantined = [];

    // Scan recordsDir for any corrupted or unparseable files that need quarantine
    const quarantinedIds = new Set();
    if (fs.existsSync(this.recordsDir)) {
      let recordFiles = [];
      try {
        recordFiles = fs.readdirSync(this.recordsDir);
      } catch {
        // Ignore
      }

      for (const file of recordFiles) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.recordsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content);
          if (!isValidRecord(parsed)) {
            this.quarantineFile(filePath, file, 'Schema validation failed: missing required fields');
            quarantinedIds.add(file.replace(/\.json$/, ''));
          }
        } catch (parseErr) {
          this.quarantineFile(filePath, file, `Malformed JSON: ${parseErr.message}`);
          quarantinedIds.add(file.replace(/\.json$/, ''));
        }
      }
    }

    // Read events from the authoritative journal
    const { events, malformed } = readJournalEvents(this.journalPath);

    if (events.length > 0) {
      // 1. Crash Consistency check: if checkpoint lagged behind valid journal head, fast-forward it
      const checkpoint = readCheckpoint(this.ledgerDir);
      const lastEvent = events[events.length - 1];
      const needsSync = forceSyncDisk || !checkpoint || checkpoint.headSequence < lastEvent.sequence;

      if (!checkpoint || checkpoint.headSequence < lastEvent.sequence) {
        writeCheckpoint(this.ledgerDir, {
          headSequence: lastEvent.sequence,
          headEventId: lastEvent.eventId,
          headChainHash: lastEvent.chainHash,
          eventCount: events.length
        });
      }

      // 2. Replay all events through the pure projection reducer
      const projectedRecords = projectEventsToRecords(events);

      for (const [id, record] of projectedRecords.entries()) {
        if (quarantinedIds.has(id)) {
          continue;
        }

        this.index.set(id, record);

        if (record.fingerprint) {
          let list = this.fingerprintIndex.get(record.fingerprint);
          if (!list) {
            list = [];
            this.fingerprintIndex.set(record.fingerprint, list);
          }
          list.push(record);
        }

        const numId = Number.parseInt(id, 10);
        if (!Number.isNaN(numId) && numId > this.highestId) {
          this.highestId = numId;
        }
      }

      // 3. Sync derived projection files to disk ONLY when needed (e.g. initial generation or head sequence change)
      if (needsSync) {
        writeProjectedRecords(this.ledgerDir, this.index);
      }
    } else if (fs.existsSync(this.recordsDir)) {
      // Legacy ledger fallback: migrate existing records to event journal
      let filenames = [];
      try {
        filenames = fs.readdirSync(this.recordsDir);
      } catch {
        return;
      }

      const legacyRecords = [];
      for (const filename of filenames) {
        if (!filename.endsWith('.json')) continue;
        const filePath = path.join(this.recordsDir, filename);

        let content;
        try {
          content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content);
          if (isValidRecord(parsed)) {
            legacyRecords.push(normalizeRecordToCurrentSchema(parsed));
          }
        } catch {
          // Ignore unreadable legacy files
        }
      }

      // Sort legacy records numerically by ID
      legacyRecords.sort((a, b) => Number(a.id) - Number(b.id));

      for (const rec of legacyRecords) {
        // Synthesize initial failure event
        appendJournalEvent(this.ledgerDir, {
          type: rec.status === IncidentStatus.REGRESSED ? 'regression.detected' : 'failure.observed',
          incidentId: rec.id,
          payload: {
            command: rec.command || '',
            args: Array.isArray(rec.args) ? rec.args : [],
            fullCommand: rec.fullCommand || `${rec.command || ''} ${(rec.args || []).join(' ')}`.trim(),
            cwd: rec.cwd || '',
            exitCode: typeof rec.exitCode === 'number' ? rec.exitCode : 1,
            signal: rec.signal || null,
            durationMs: typeof rec.durationMs === 'number' ? rec.durationMs : 0,
            fingerprint: rec.fingerprint || '',
            normalizedError: rec.normalizedError || '',
            evidenceHash: rec.evidenceHash || '',
            evidenceRef: rec.evidenceRef || '',
            stderrSnippet: rec.stderr || '',
            stdoutSnippet: rec.stdout || '',
            isTruncated: Boolean(rec.isTruncated),
            environment: rec.environment || {},
            git: rec.git || { isGit: false },
            regressionOf: rec.regressionOf || null
          }
        });

        // Synthesize recovery attempts if any
        if (Array.isArray(rec.recoveryAttempts)) {
          for (const att of rec.recoveryAttempts) {
            appendJournalEvent(this.ledgerDir, {
              type: 'recovery.proposed',
              incidentId: rec.id,
              payload: {
                attemptId: att.id || 1,
                cause: att.cause || null,
                change: att.change || null,
                verifyCmd: att.verifyCmd || null
              }
            });

            if (Array.isArray(att.verificationRuns)) {
              for (const run of att.verificationRuns) {
                appendJournalEvent(this.ledgerDir, {
                  type: 'verification.run',
                  incidentId: rec.id,
                  payload: {
                    attemptId: att.id || 1,
                    runId: run.id || 1,
                    command: run.command || '',
                    exitCode: typeof run.exitCode === 'number' ? run.exitCode : 0,
                    durationMs: typeof run.durationMs === 'number' ? run.durationMs : 0,
                    output: run.output || '',
                    outputHash: run.outputHash || crypto.createHash('sha256').update(run.output || '', 'utf8').digest('hex'),
                    environmentFingerprint: run.environmentFingerprint || '',
                    result: run.result || (run.exitCode === 0 ? 'PASSED' : 'FAILED')
                  }
                });
              }
            }
          }
        }
      }

      // Re-read newly generated journal
      const reloaded = readJournalEvents(this.journalPath);
      const replayed = projectEventsToRecords(reloaded.events);

      for (const [id, record] of replayed.entries()) {
        this.index.set(id, record);
        const numId = Number.parseInt(id, 10);
        if (!Number.isNaN(numId) && numId > this.highestId) {
          this.highestId = numId;
        }
      }

      writeProjectedRecords(this.ledgerDir, replayed);
    }
  }

  /**
   * Rebuilds all derived incident files and in-memory indexes by replaying the authoritative journal.
   * Never modifies or alters journal.jsonl.
   *
   * @returns {{ eventsReplayed: number, incidentsDerived: number }}
   */
  rebuildProjections() {
    if (!this.initialized) {
      this.init();
    }

    const { events } = readJournalEvents(this.journalPath);
    const projected = projectEventsToRecords(events);

    this.index.clear();
    this.highestId = 0;

    for (const [id, record] of projected.entries()) {
      this.index.set(id, record);
      const numId = Number.parseInt(id, 10);
      if (!Number.isNaN(numId) && numId > this.highestId) {
        this.highestId = numId;
      }
    }

    writeProjectedRecords(this.ledgerDir, projected);

    return {
      eventsReplayed: events.length,
      incidentsDerived: projected.size
    };
  }

  /**
   * Performs a 4-layer read-only integrity audit across journal, checkpoint, and projections.
   *
   * @returns {object} - Comprehensive integrity report
   */
  verifyIntegrity() {
    return verifyLedgerIntegrity(this.ledgerDir);
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
    const list = this.fingerprintIndex.get(fingerprint);
    if (!list) return [];
    return [...list].sort((a, b) => Number(b.id) - Number(a.id));
  }

  /**
   * Searches for a prior record that reached the RECOVERED / VERIFIED state with the same fingerprint.
   *
   * @param {string} fingerprint
   * @returns {import('./record.js').IncidentRecord|null}
   */
  findVerifiedByFingerprint(fingerprint) {
    if (!fingerprint) return null;
    const list = this.fingerprintIndex.get(fingerprint);
    if (!list) return null;
    let latestVerified = null;

    for (const record of list) {
      const isRecovered = record.status === IncidentStatus.RECOVERED || record.status === 'VERIFIED';
      if (isRecovered) {
        if (!latestVerified || Number(record.id) > Number(latestVerified.id)) {
          latestVerified = record;
        }
      }
    }
    return latestVerified;
  }

  /**
   * Saves a command capture result as an immutable event in the authoritative journal,
   * updates the trusted checkpoint, and writes derived projection files.
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

    const { fingerprint, normalizedError } = computeFingerprint({
      command: captureResult.command || '',
      args: captureResult.args || [],
      exitCode: captureResult.exitCode,
      signal: captureResult.signal,
      stderr: captureResult.stderr || '',
      stdout: captureResult.stdout || ''
    });

    if (!captureResult.success && !initialState) {
      const priorVerified = this.findVerifiedByFingerprint(fingerprint);
      if (priorVerified) {
        initialState = IncidentStatus.REGRESSED;
        regressionOf = priorVerified.id;
      } else {
        initialState = IncidentStatus.OBSERVED;
      }
    }

    // Process heavy evidence: save to isolated evidence store and bound output
    const rawStderr = captureResult.stderr || '';
    const rawStdout = captureResult.stdout || '';
    const fullOutput = rawStderr + (rawStderr && rawStdout ? '\n' : '') + rawStdout;

    const { evidenceHash, evidenceRef } = saveEvidenceArtifact(this.ledgerDir, fullOutput);
    const boundStderr = boundOutput(rawStderr);
    const boundStdout = boundOutput(rawStdout);
    const isTruncated = boundStderr.truncated || boundStdout.truncated;

    const eventType = initialState === IncidentStatus.REGRESSED ? 'regression.detected' : 'failure.observed';

    // Append to authoritative journal (with exclusive lock, fsync, and checkpoint update)
    appendJournalEvent(this.ledgerDir, {
      type: eventType,
      incidentId: id,
      payload: {
        command: captureResult.command || '',
        args: Array.isArray(captureResult.args) ? captureResult.args : [],
        fullCommand: captureResult.fullCommand || `${captureResult.command || ''} ${(captureResult.args || []).join(' ')}`.trim(),
        cwd: captureResult.cwd || '',
        durationMs: typeof captureResult.durationMs === 'number' ? captureResult.durationMs : 0,
        exitCode: typeof captureResult.exitCode === 'number' ? captureResult.exitCode : 1,
        signal: captureResult.signal || null,
        fingerprint: fingerprint || '',
        normalizedError: normalizedError || '',
        evidenceHash: evidenceHash || '',
        evidenceRef: evidenceRef || '',
        stderrSnippet: boundStderr.bounded || '',
        stdoutSnippet: boundStdout.bounded || '',
        isTruncated: Boolean(isTruncated),
        diagnostic: captureResult.diagnostic || null,
        environment: captureResult.environment || {},
        git: captureResult.git || { isGit: false },
        regressionOf: regressionOf || null
      }
    });

    // Replay projection for the new event and update in-memory index
    this.rebuildIndex({ syncDisk: true });

    const record = this.index.get(id);
    return record;
  }

  /**
   * Appends a new recovery attempt event to the authoritative journal and updates derived state.
   *
   * @param {string|number} id
   * @param {object} attemptData
   * @param {string|null} [attemptData.cause]
   * @param {string|null} [attemptData.change]
   * @param {string|null} [attemptData.verifyCmd]
   * @returns {import('./record.js').IncidentRecord}
   */
  addRecoveryAttempt(id, attemptData) {
    if (!this.initialized) {
      this.init();
    }

    const strId = normalizeId(id);
    const existing = this.getRecord(strId);
    if (!existing) {
      throw new CliError(`Incident #${strId} not found in ledger.`, {
        code: 'ERR_NOT_FOUND',
        exitCode: 1,
        details: { id: strId, suggestion: 'Run "rewind history" to browse all past incidents.' }
      });
    }

    const currentAttempts = Array.isArray(existing.recoveryAttempts) ? existing.recoveryAttempts : [];
    const attemptId = currentAttempts.length + 1;

    // Append recovery.proposed event to authoritative journal
    appendJournalEvent(this.ledgerDir, {
      type: 'recovery.proposed',
      incidentId: strId,
      payload: {
        attemptId,
        cause: attemptData.cause || null,
        change: attemptData.change || null,
        verifyCmd: attemptData.verifyCmd || null
      }
    });

    // Replay projection and refresh in-memory state
    this.rebuildIndex({ syncDisk: true });

    return this.getRecord(strId);
  }

  /**
   * Records a verification execution run on a specific recovery attempt in the authoritative journal.
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
    if (!this.initialized) {
      this.init();
    }

    const strId = normalizeId(id);
    const existing = this.getRecord(strId);
    if (!existing) {
      throw new CliError(`Incident #${strId} not found in ledger.`, {
        code: 'ERR_NOT_FOUND',
        exitCode: 1,
        details: { id: strId, suggestion: 'Run "rewind history" to browse all past incidents.' }
      });
    }

    const currentAttempts = Array.isArray(existing.recoveryAttempts) ? existing.recoveryAttempts : [];
    const targetAttempt = currentAttempts.find(a => a.id === attemptId);
    if (!targetAttempt) {
      throw new CliError(`Attempt #${attemptId} not found in Incident #${strId}.`);
    }

    const currentRuns = Array.isArray(targetAttempt.verificationRuns) ? targetAttempt.verificationRuns : [];
    const runId = currentRuns.length + 1;
    const isPassed = runData.exitCode === 0;
    const outputContent = runData.output || '';
    const outputHash = crypto.createHash('sha256').update(outputContent, 'utf8').digest('hex');

    // Append verification.run event to authoritative journal
    appendJournalEvent(this.ledgerDir, {
      type: 'verification.run',
      incidentId: strId,
      payload: {
        attemptId,
        runId,
        command: runData.command,
        exitCode: runData.exitCode,
        durationMs: runData.durationMs || 0,
        output: outputContent,
        outputHash,
        environmentFingerprint: runData.environmentFingerprint || existing.environment?.fingerprint || '',
        result: isPassed ? 'PASSED' : 'FAILED'
      }
    });

    // Replay projection and refresh in-memory state
    this.rebuildIndex({ syncDisk: true });

    return this.getRecord(strId);
  }

  /**
   * Compatibility method for updating arbitrary fields via updater function.
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
    const existing = this.getRecord(strId);
    if (!existing) {
      throw new CliError(`Incident #${strId} not found in ledger.`, {
        code: 'ERR_NOT_FOUND',
        exitCode: 1,
        details: { id: strId, suggestion: 'Run "rewind history" to browse all past incidents.' }
      });
    }

    const updated = updaterFn(existing);
    const normalized = normalizeRecordToCurrentSchema(updated);

    // If updating recoveries/attempts, append events
    if (updated.recoveryAttempts && updated.recoveryAttempts.length > (existing.recoveryAttempts || []).length) {
      const latestAttempt = updated.recoveryAttempts[updated.recoveryAttempts.length - 1];
      return this.addRecoveryAttempt(strId, latestAttempt);
    }

    // Otherwise sync directly
    this.index.set(strId, normalized);
    writeProjectedRecords(this.ledgerDir, this.index);
    return normalized;
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
   * Extracts all known failed recovery approaches across a failure family.
   *
   * @param {string} fingerprint
   * @returns {Array<import('./negative_memory.js').FailedApproach>}
   */
  getNegativeMemory(fingerprint) {
    const familyRecords = this.findByFingerprint(fingerprint);
    return extractNegativeMemory(familyRecords);
  }

  /**
   * Analyzes contradictory or divergent verification evidence across a failure family.
   *
   * @param {string} fingerprint
   * @returns {import('./contradiction.js').ConflictReport}
   */
  getContradictionReport(fingerprint) {
    const familyRecords = this.findByFingerprint(fingerprint);
    return analyzeEvidenceConflicts(fingerprint, familyRecords);
  }

  /**
   * Retrieves an incident record by ID.
   *
   * @param {string|number} id
   * @returns {import('./record.js').IncidentRecord|null}
   */
  getRecord(id) {
    if (!this.initialized) {
      this.init();
    }
    const strId = normalizeId(id);
    return this.index.get(strId) || null;
  }

  /**
   * Returns active incident records. Supports bounded querying and reverse order.
   *
   * @param {object} [options={}]
   * @param {number} [options.limit]
   * @param {boolean} [options.reverse=false]
   * @returns {Array<import('./record.js').IncidentRecord>}
   */
  listRecords(options = {}) {
    if (!this.initialized) {
      this.init();
    }

    const { limit, reverse = false } = options;
    const values = Array.from(this.index.values());

    if (reverse) {
      values.reverse();
    }

    if (typeof limit === 'number' && limit > 0) {
      return values.slice(0, limit);
    }

    return values;
  }

  /**
   * Generates a deterministic pattern intelligence report from the authoritative journal.
   *
   * @param {object} [options={}]
   * @param {string} [options.fingerprint]
   * @param {number} [options.limit]
   * @returns {object}
   */
  getPatternReport(options = {}) {
    if (!this.initialized) {
      this.init();
    }
    return analyzePatternsFromJournal(this.ledgerDir, options);
  }

  /**
   * Generates an Agent Context payload from the authoritative journal.
   *
   * @param {string|number} [targetIdOrLatest='latest']
   * @param {object} [options={}]
   * @returns {object}
   */
  getAgentContext(targetIdOrLatest = 'latest', options = {}) {
    if (!this.initialized) {
      this.init();
    }
    return buildAgentContext(this.ledgerDir, targetIdOrLatest, options);
  }

  /**
   * Returns list of currently quarantined files.
   *
   * @returns {Array<{ file: string, reason: string, quarantinedAt: string }>}
   */
  getQuarantined() {
    return this.quarantined;
  }

  /**
   * Runs the complete self-diagnostics suite across ledger integrity, storage, and runtime.
   *
   * @param {object} [config={}]
   * @param {object} [options={}]
   * @returns {object}
   */
  diagnoseHealth(config = {}, options = {}) {
    return runDoctorDiagnostics(this.ledgerDir, config, options);
  }

  /**
   * Executes a safe non-destructive repair on derived projections and temporary directories.
   *
   * @param {object} [config={}]
   * @param {object} [options={}]
   * @returns {object}
   */
  repairHealth(config = {}, options = {}) {
    return executeDoctorRepair(this.ledgerDir, config, options);
  }
}
