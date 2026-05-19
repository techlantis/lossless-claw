import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIndependentLcmFileLogger } from "../src/lcm-file-log.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcm-file-log-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("createIndependentLcmFileLogger", () => {
  it("writes JSONL records to the configured lossless-owned file", () => {
    const file = path.join(tempDir, "lossless-claw-test.log");
    const logger = createIndependentLcmFileLogger({
      enabled: true,
      file,
      maxFileBytes: 1024 * 1024,
    });

    logger?.write("info", "[lcm] Plugin loaded");

    const line = fs.readFileSync(file, "utf8").trim();
    const record = JSON.parse(line) as Record<string, unknown>;
    expect(record.level).toBe("info");
    expect(record.plugin).toBe("lossless-claw");
    expect(record.message).toBe("[lcm] Plugin loaded");
    expect(typeof record.time).toBe("string");
  });

  it("rotates oversized active files through numbered suffixes", () => {
    const file = path.join(tempDir, "lossless-claw-test.log");
    const logger = createIndependentLcmFileLogger({
      enabled: true,
      file,
      maxFileBytes: 80,
    });

    logger?.write("info", "[lcm] first message with enough bytes to rotate next");
    logger?.write("warn", "[lcm] second message rotates the first file");

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "lossless-claw-test.1.log"))).toBe(true);
  });

  it("redacts obvious secret-shaped text before writing", () => {
    const file = path.join(tempDir, "lossless-claw-test.log");
    const logger = createIndependentLcmFileLogger({
      enabled: true,
      file,
      maxFileBytes: 1024 * 1024,
    });

    logger?.write("error", "[lcm] failed token=super-secret-token-value");

    expect(fs.readFileSync(file, "utf8")).toContain("token=[REDACTED]");
  });

  it("does not write when disabled", () => {
    const file = path.join(tempDir, "lossless-claw-test.log");
    const logger = createIndependentLcmFileLogger({
      enabled: false,
      file,
      maxFileBytes: 1024 * 1024,
    });

    logger?.write("info", "[lcm] ignored");

    expect(fs.existsSync(file)).toBe(false);
  });

  it("disables independent file logging when setup cannot create the log directory", () => {
    const parentAsFile = path.join(tempDir, "not-a-directory");
    fs.writeFileSync(parentAsFile, "occupied");

    expect(
      createIndependentLcmFileLogger({
        enabled: true,
        file: path.join(parentAsFile, "lossless-claw-test.log"),
        maxFileBytes: 1024 * 1024,
      }),
    ).toBeUndefined();
  });
});
