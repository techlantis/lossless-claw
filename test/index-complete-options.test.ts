import { describe, expect, it } from "vitest";
import { buildCompleteSimpleOptions, shouldOmitTemperatureForApi } from "../index.js";

describe("buildCompleteSimpleOptions", () => {
  it("omits temperature for openai-codex-responses", () => {
    const options = buildCompleteSimpleOptions({
      api: "openai-codex-responses",
      apiKey: "k",
      maxTokens: 400,
      temperature: 0.2,
      reasoning: "low",
    });

    expect(shouldOmitTemperatureForApi("openai-codex-responses")).toBe(true);
    expect(options.temperature).toBeUndefined();
    expect(options.reasoning).toBe("low");
  });

  it("keeps temperature for non-codex APIs", () => {
    const options = buildCompleteSimpleOptions({
      api: "openai-responses",
      apiKey: "k",
      maxTokens: 400,
      temperature: 0.2,
      reasoning: undefined,
    });

    expect(shouldOmitTemperatureForApi("openai-responses")).toBe(false);
    expect(options.temperature).toBe(0.2);
    expect(options.reasoning).toBeUndefined();
  });

  it("adds Techlantis OpenRouter Gemini Flash reasoning exclude payload hints", async () => {
    const options = buildCompleteSimpleOptions({
      api: "openai-completions",
      provider: "openrouter",
      model: "google/gemini-3.5-flash",
      apiKey: "k",
      maxTokens: 400,
      temperature: 0.2,
      reasoning: "low",
    });

    expect(options.reasoning).toBe("low");
    expect(options.metadata).toMatchObject({
      openclaw_compaction_summary: true,
      techlantis_reasoning_exclude: true,
    });
    expect(typeof options.onPayload).toBe("function");

    const payload = await options.onPayload?.(
      {
        model: "google/gemini-3.5-flash",
        messages: [],
        reasoning: { effort: "low" },
      },
      {},
    );

    expect(payload).toMatchObject({
      reasoning: {
        effort: "low",
        exclude: true,
      },
    });
  });

  it("does not add Techlantis payload hints to non-target models", () => {
    const options = buildCompleteSimpleOptions({
      api: "openai-completions",
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-5",
      apiKey: "k",
      maxTokens: 400,
      temperature: 0.2,
      reasoning: "low",
    });

    expect(options.metadata).toBeUndefined();
    expect(options.onPayload).toBeUndefined();
  });
});
