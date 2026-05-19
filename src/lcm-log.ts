import type { OpenClawPluginApi } from "./openclaw-bridge.js";
import type { LcmDependencies } from "./types.js";
import type { LcmConfig } from "./db/config.js";
import { createIndependentLcmFileLogger, type LcmFileLogLevel } from "./lcm-file-log.js";

export type LcmLogger = LcmDependencies["log"];

/** Silent logger used when a caller does not provide an explicit sink. */
export const NOOP_LCM_LOGGER: LcmLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** Format unknown failures into stable one-line log text. */
export function describeLogError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function teeLogger(
  base: LcmLogger,
  fileLogger: ReturnType<typeof createIndependentLcmFileLogger>,
): LcmLogger {
  const write = (level: LcmFileLogLevel, message: string, emit: (message: string) => void) => {
    emit(message);
    fileLogger?.write(level, message);
  };
  return {
    info: (message) => write("info", message, base.info),
    warn: (message) => write("warn", message, base.warn),
    error: (message) => write("error", message, base.error),
    debug: (message) => write("debug", message, base.debug),
  };
}

/** Create the LCM logger, preferring OpenClaw's file-backed runtime logger. */
export function createLcmLogger(api: OpenClawPluginApi, config: LcmConfig): LcmLogger {
  const fileLogger = createIndependentLcmFileLogger(config.independentLogFile);
  const runtimeLogger = api.runtime?.logging?.getChildLogger?.({ plugin: "lossless-claw" });
  if (runtimeLogger) {
    return teeLogger(
      {
        info: (message) => runtimeLogger.info(message),
        warn: (message) => runtimeLogger.warn(message),
        error: (message) => runtimeLogger.error(message),
        debug: (message) => runtimeLogger.debug?.(message),
      },
      fileLogger,
    );
  }

  return teeLogger(
    {
      info: (message) => api.logger.info(message),
      warn: (message) => api.logger.warn(message),
      error: (message) => api.logger.error(message),
      debug: (message) => api.logger.debug?.(message),
    },
    fileLogger,
  );
}
