/**
 * Standard exit codes for the Rewind CLI.
 * 0 = Success
 * 1 = General operational / runtime error or not-implemented status
 * 2 = CLI usage error (invalid command, missing argument, unknown flag)
 */
export const ExitCodes = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE_ERROR: 2
});

/**
 * Base structured CLI Error.
 */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {number} [options.exitCode=1]
   * @param {string} [options.code='ERR_CLI']
   * @param {Record<string, unknown>} [options.details]
   */
  constructor(message, { exitCode = ExitCodes.FAILURE, code = 'ERR_CLI', details = {} } = {}) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
      ...(Object.keys(this.details).length > 0 ? { details: this.details } : {})
    };
  }
}

/**
 * Thrown when command syntax or arguments are invalid (Exit Code 2).
 */
export class UsageError extends CliError {
  constructor(message, details = {}) {
    super(message, { exitCode: ExitCodes.USAGE_ERROR, code: 'ERR_USAGE', details });
    this.name = 'UsageError';
  }
}

/**
 * Thrown when an unrecognized subcommand is given (Exit Code 2).
 */
export class UnknownCommandError extends UsageError {
  constructor(command) {
    super(`Unknown command: "${command}". Run "rewind --help" for available commands.`, { command });
    this.name = 'UnknownCommandError';
    this.code = 'ERR_UNKNOWN_COMMAND';
  }
}

/**
 * Thrown when a required argument is missing (Exit Code 2).
 */
export class MissingArgumentError extends UsageError {
  constructor(argName, commandUsage) {
    super(`Missing required argument <${argName}>.${commandUsage ? ` Usage: ${commandUsage}` : ''}`, { argName, commandUsage });
    this.name = 'MissingArgumentError';
    this.code = 'ERR_MISSING_ARGUMENT';
  }
}

/**
 * Thrown when an invalid argument or flag value is passed (Exit Code 2).
 */
export class InvalidArgumentError extends UsageError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = 'InvalidArgumentError';
    this.code = 'ERR_INVALID_ARGUMENT';
  }
}

/**
 * Thrown when a command is defined but not yet implemented (Exit Code 1).
 */
export class NotImplementedError extends CliError {
  constructor(feature, message) {
    super(message || `Feature not implemented yet: ${feature}`, {
      exitCode: ExitCodes.FAILURE,
      code: 'ERR_NOT_IMPLEMENTED',
      details: { feature }
    });
    this.name = 'NotImplementedError';
  }
}

/**
 * Thrown for configuration / root discovery issues (Exit Code 1).
 */
export class ConfigError extends CliError {
  constructor(message, details = {}) {
    super(message, { exitCode: ExitCodes.FAILURE, code: 'ERR_CONFIG', details });
    this.name = 'ConfigError';
  }
}
