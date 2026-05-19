import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IndependentLogFileConfig } from "./db/config.js";

const LOG_PREFIX = "lossless-claw";
const LOG_SUFFIX = ".log";
const POSIX_OPENCLAW_TMP_DIR = "/tmp/openclaw";
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ROTATED_LOG_FILES = 5;

export type LcmFileLogLevel = "info" | "warn" | "error" | "debug";

type LcmFileLogger = {
  write: (level: LcmFileLogLevel, message: string) => void;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rollingPathForDate(dir: string, date: Date): string {
  return path.join(dir, `${LOG_PREFIX}-${formatLocalDate(date)}${LOG_SUFFIX}`);
}

function defaultRollingPath(date = new Date()): string {
  return rollingPathForDate(resolvePreferredOpenClawTmpDir(), date);
}

function isRollingPath(file: string): boolean {
  const base = path.basename(file);
  return (
    base.startsWith(`${LOG_PREFIX}-`) &&
    base.endsWith(LOG_SUFFIX) &&
    base.length === `${LOG_PREFIX}-YYYY-MM-DD${LOG_SUFFIX}`.length
  );
}

function resolveActiveLogFile(file: string): string {
  const expandedFile = expandHomePrefix(file);
  if (!isRollingPath(expandedFile)) {
    return expandedFile;
  }
  return rollingPathForDate(path.dirname(expandedFile), new Date());
}

function expandHomePrefix(file: string): string {
  if (file === "~") {
    return os.homedir();
  }
  if (file.startsWith("~/")) {
    return path.join(os.homedir(), file.slice(2));
  }
  return file;
}

function resolvePreferredOpenClawTmpDir(): string {
  if (process.platform === "win32") {
    return path.join(os.tmpdir(), "openclaw");
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  const fallbackDir = path.join(os.tmpdir(), `openclaw-${uid}`);
  const ensureTrustedFallbackDir = (): string => {
    fs.mkdirSync(fallbackDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(fallbackDir, 0o700);
    const stat = fs.lstatSync(fallbackDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Unsafe fallback OpenClaw temp dir: ${fallbackDir}`);
    }
    return fallbackDir;
  };

  try {
    let stat: fs.Stats | undefined;
    try {
      stat = fs.lstatSync(POSIX_OPENCLAW_TMP_DIR);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      fs.mkdirSync(POSIX_OPENCLAW_TMP_DIR, { recursive: true, mode: 0o700 });
      stat = fs.lstatSync(POSIX_OPENCLAW_TMP_DIR);
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.chmodSync(POSIX_OPENCLAW_TMP_DIR, 0o700);
      return POSIX_OPENCLAW_TMP_DIR;
    }
  } catch {
    // Fall back below.
  }

  return ensureTrustedFallbackDir();
}

function pruneOldRollingLogs(dir: string): void {
  try {
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.startsWith(`${LOG_PREFIX}-`) || !entry.name.endsWith(LOG_SUFFIX)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      try {
        if (fs.statSync(fullPath).mtimeMs < cutoff) {
          fs.rmSync(fullPath, { force: true });
        }
      } catch {
        // Ignore pruning failures.
      }
    }
  } catch {
    // Ignore missing dir or read errors.
  }
}

function getCurrentLogFileBytes(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function rotatedLogPath(file: string, index: number): string {
  const ext = path.extname(file);
  const base = file.slice(0, file.length - ext.length);
  return `${base}.${index}${ext}`;
}

function rotateLogFile(file: string): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(rotatedLogPath(file, MAX_ROTATED_LOG_FILES), { force: true });
    for (let index = MAX_ROTATED_LOG_FILES - 1; index >= 1; index -= 1) {
      const from = rotatedLogPath(file, index);
      if (fs.existsSync(from)) {
        fs.renameSync(from, rotatedLogPath(file, index + 1));
      }
    }
    if (fs.existsSync(file)) {
      fs.renameSync(file, rotatedLogPath(file, 1));
    }
    return true;
  } catch {
    return false;
  }
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "$1 [REDACTED]")
    .replace(/\b(api[_-]?key|token|password|secret)=\S+/gi, "$1=[REDACTED]");
}

function appendRegularFileSync(file: string, content: string): boolean {
  try {
    const stat = fs.existsSync(file) ? fs.lstatSync(file) : undefined;
    if (stat?.isSymbolicLink() || stat?.isDirectory()) {
      return false;
    }
    fs.appendFileSync(file, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function createIndependentLcmFileLogger(
  config: IndependentLogFileConfig,
): LcmFileLogger | undefined {
  if (!config.enabled) {
    return undefined;
  }

  let configuredFile: string;
  let rollingFile: boolean;
  let activeFile: string;
  let currentFileBytes: number;
  try {
    configuredFile = config.file?.trim() || defaultRollingPath();
    rollingFile = isRollingPath(expandHomePrefix(configuredFile));
    activeFile = resolveActiveLogFile(configuredFile);
    fs.mkdirSync(path.dirname(activeFile), { recursive: true, mode: 0o700 });
    if (rollingFile) {
      pruneOldRollingLogs(path.dirname(activeFile));
    }
    currentFileBytes = getCurrentLogFileBytes(activeFile);
  } catch {
    return undefined;
  }

  return {
    write(level, message) {
      try {
        const nextActiveFile = resolveActiveLogFile(configuredFile);
        if (nextActiveFile !== activeFile) {
          activeFile = nextActiveFile;
          fs.mkdirSync(path.dirname(activeFile), { recursive: true, mode: 0o700 });
          if (rollingFile) {
            pruneOldRollingLogs(path.dirname(activeFile));
          }
          currentFileBytes = getCurrentLogFileBytes(activeFile);
        }

        const record = {
          time: new Date().toISOString(),
          level,
          plugin: "lossless-claw",
          message,
        };
        const payload = `${redactSensitiveText(JSON.stringify(record))}\n`;
        const payloadBytes = Buffer.byteLength(payload, "utf8");
        if (currentFileBytes > 0 && currentFileBytes + payloadBytes > config.maxFileBytes) {
          if (rotateLogFile(activeFile)) {
            currentFileBytes = getCurrentLogFileBytes(activeFile);
          }
        }
        if (appendRegularFileSync(activeFile, payload)) {
          currentFileBytes += payloadBytes;
        }
      } catch {
        // Logging must never affect Lossless runtime behavior.
      }
    },
  };
}

export const __testing = {
  defaultRollingPath,
  resolveActiveLogFile,
};
