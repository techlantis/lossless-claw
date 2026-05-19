import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLcmLogger } from "../src/lcm-log.js";
import type { LcmConfig } from "../src/db/config.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcm-log-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function baseConfig(file: string): LcmConfig {
  return {
    enabled: true,
    databasePath: path.join(tempDir, "lcm.db"),
    largeFilesDir: path.join(tempDir, "lcm-files"),
    ignoreSessionPatterns: [],
    statelessSessionPatterns: [],
    skipStatelessSessions: true,
    contextThreshold: 0.75,
    freshTailCount: 64,
    promptAwareEviction: false,
    stubLargeToolPayloads: false,
    newSessionRetainDepth: 2,
    leafMinFanout: 8,
    condensedMinFanout: 4,
    condensedMinFanoutHard: 2,
    sweepMaxDepth: 1,
    incrementalMaxDepth: 1,
    leafChunkTokens: 20000,
    leafTargetTokens: 2400,
    condensedTargetTokens: 2000,
    maxExpandTokens: 4000,
    largeFileTokenThreshold: 25000,
    summaryProvider: "",
    summaryModel: "",
    largeFileSummaryProvider: "",
    largeFileSummaryModel: "",
    expansionProvider: "",
    expansionModel: "",
    delegationTimeoutMs: 120000,
    summaryTimeoutMs: 60000,
    timezone: "UTC",
    pruneHeartbeatOk: false,
    transcriptGcEnabled: false,
    proactiveThresholdCompactionMode: "deferred",
    autoRotateSessionFiles: {
      enabled: true,
      createBackups: false,
      sizeBytes: 2097152,
      startup: "rotate",
      runtime: "rotate",
    },
    independentLogFile: {
      enabled: true,
      file,
      maxFileBytes: 1024 * 1024,
    },
    summaryMaxOverageFactor: 3,
    customInstructions: "",
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 1800000,
    fallbackProviders: [],
    cacheAwareCompaction: {
      enabled: true,
      cacheTTLSeconds: 300,
      maxColdCacheCatchupPasses: 2,
      hotCachePressureFactor: 4,
      hotCacheBudgetHeadroomRatio: 0.2,
      coldCacheObservationThreshold: 3,
      criticalBudgetPressureRatio: 0.9,
    },
    dynamicLeafChunkTokens: {
      enabled: true,
      max: 40000,
    },
  };
}

describe("createLcmLogger", () => {
  it("tees runtime logger lines to the independent log file", () => {
    const file = path.join(tempDir, "lossless-claw-test.log");
    const info = vi.fn();
    const logger = createLcmLogger({
      runtime: {
        logging: {
          getChildLogger: vi.fn(() => ({
            info,
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
          })),
        },
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    } as never, baseConfig(file));

    logger.info("[lcm] tee me");

    expect(info).toHaveBeenCalledWith("[lcm] tee me");
    expect(fs.readFileSync(file, "utf8")).toContain("[lcm] tee me");
  });
});
