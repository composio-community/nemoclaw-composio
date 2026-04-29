// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { OpenClawPluginApi, PluginToolDefinition } from "../index.js";
import { registerComposioAgentTools } from "./plugin-tools.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

function makeApi(): OpenClawPluginApi & {
  registerTool: ReturnType<typeof vi.fn<[PluginToolDefinition], void>>;
} {
  return {
    id: "nemoclaw",
    name: "NemoClaw",
    config: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    registerCommand: vi.fn(),
    registerProvider: vi.fn(),
    registerService: vi.fn(),
    registerTool: vi.fn(),
    resolvePath: vi.fn((p: string) => p),
    on: vi.fn(),
  };
}

function getRegisteredTool(api: ReturnType<typeof makeApi>): PluginToolDefinition {
  const tool = api.registerTool.mock.calls[0]?.[0];
  if (!tool) throw new Error("expected a registered tool");
  return tool;
}

describe("composio/plugin-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecFileSync.mockReset();
  });

  it("warns when OpenClaw does not expose registerTool", () => {
    const api = makeApi();
    delete api.registerTool;

    registerComposioAgentTools(api);

    expect(api.logger.warn).toHaveBeenCalledWith(
      "[Composio] OpenClaw plugin host does not expose registerTool",
    );
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it("warns when helper schemas cannot be loaded", () => {
    const api = makeApi();
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("helper failed");
    });

    registerComposioAgentTools(api);

    expect(api.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not load integration schemas"),
    );
    expect(api.registerTool).not.toHaveBeenCalled();
  });

  it("registers valid Composio tool definitions and skips incomplete entries", async () => {
    const api = makeApi();
    mockedExecFileSync.mockImplementation((_bin, args) => {
      if (Array.isArray(args) && args[0] === "tools") {
        return JSON.stringify([
          {
            type: "function",
            function: {
              name: "COMPOSIO_SEARCH_TOOLS",
              description: "Search Composio tools",
              parameters: { type: "object", properties: { query: { type: "string" } } },
            },
          },
          { type: "function", function: { name: "MISSING_DESCRIPTION" } },
        ]);
      }
      if (Array.isArray(args) && args[0] === "call") {
        return JSON.stringify({ ok: true, tools: ["github"] });
      }
      throw new Error(`unexpected args: ${String(args)}`);
    });

    registerComposioAgentTools(api);

    expect(api.registerTool).toHaveBeenCalledTimes(1);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "COMPOSIO_SEARCH_TOOLS",
        description: "Search Composio tools",
      }),
    );
    expect(api.logger.info).toHaveBeenCalledWith("[Composio] Registered 2 integration tools");

    const tool = getRegisteredTool(api);
    const result = await tool.execute("call-1", { query: "github" });

    expect(mockedExecFileSync).toHaveBeenLastCalledWith(
      "nemoclaw-composio",
      ["call", "COMPOSIO_SEARCH_TOOLS"],
      expect.objectContaining({
        input: JSON.stringify({ query: "github" }),
        timeout: 30000,
      }),
    );
    expect(result.content[0]?.text).toContain('"github"');
  });

  it("returns a friendly message when execution returns no output", async () => {
    const api = makeApi();
    mockedExecFileSync.mockImplementation((_bin, args) => {
      if (Array.isArray(args) && args[0] === "tools") {
        return JSON.stringify([
          {
            function: {
              name: "EMPTY_TOOL",
              description: "Returns nothing",
              parameters: { type: "object" },
            },
          },
        ]);
      }
      return "";
    });

    registerComposioAgentTools(api);
    const tool = getRegisteredTool(api);
    const result = await tool.execute("call-1", {});

    expect(result.content[0]?.text).toBe("Composio returned no output.");
  });

  it("passes through non-JSON execution output", async () => {
    const api = makeApi();
    mockedExecFileSync.mockImplementation((_bin, args) => {
      if (Array.isArray(args) && args[0] === "tools") {
        return JSON.stringify([
          {
            function: {
              name: "RAW_TOOL",
              description: "Returns raw output",
              parameters: { type: "object" },
            },
          },
        ]);
      }
      return "raw output";
    });

    registerComposioAgentTools(api);
    const tool = getRegisteredTool(api);
    const result = await tool.execute("call-1", {});

    expect(result.content[0]?.text).toBe("raw output");
  });
});
