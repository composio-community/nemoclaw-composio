// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { PluginCommandContext } from "../index.js";
import { slashComposio } from "./composio.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

function makeCtx(args?: string): PluginCommandContext {
  return {
    channel: "test",
    isAuthorizedSender: true,
    args,
    commandBody: `/composio${args ? ` ${args}` : ""}`,
    config: {},
  };
}

describe("commands/composio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecFileSync.mockReset();
  });

  it("renders help for empty args and help", () => {
    expect(slashComposio(makeCtx()).text).toContain("Composio Integration");
    expect(slashComposio(makeCtx("help")).text).toContain("platform.composio.dev/settings");
  });

  it("rejects unknown subcommands", () => {
    expect(slashComposio(makeCtx("wat")).text).toContain("Unknown subcommand `wat`");
  });

  it("formats status JSON", () => {
    mockedExecFileSync.mockReturnValue(
      JSON.stringify({ ok: true, userId: "alice", mcpAvailable: true }),
    );

    const result = slashComposio(makeCtx("status"));

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      "nemoclaw-composio",
      ["status"],
      expect.objectContaining({ timeout: 15000 }),
    );
    expect(result.text).toContain("Session: ok");
    expect(result.text).toContain("User ID: alice");
    expect(result.text).toContain("MCP available: yes");
  });

  it("falls back to raw status output when JSON parsing fails", () => {
    mockedExecFileSync.mockReturnValue("plain status");

    expect(slashComposio(makeCtx("status")).text).toContain("plain status");
  });

  it("lists tool names from supported fields", () => {
    mockedExecFileSync.mockReturnValue(
      JSON.stringify([
        { name: "COMPOSIO_SEARCH_TOOLS" },
        { slug: "GITHUB_CREATE_ISSUE" },
        { id: "SLACK_SEND_MESSAGE" },
      ]),
    );

    const result = slashComposio(makeCtx("tools"));

    expect(result.text).toContain("`COMPOSIO_SEARCH_TOOLS`");
    expect(result.text).toContain("`GITHUB_CREATE_ISSUE`");
    expect(result.text).toContain("`SLACK_SEND_MESSAGE`");
  });

  it("reports empty tool lists", () => {
    mockedExecFileSync.mockReturnValue("[]");

    expect(slashComposio(makeCtx("tools")).text).toContain("no tools returned");
  });

  it("shows raw tools output when parsing fails", () => {
    mockedExecFileSync.mockReturnValue("not json");

    expect(slashComposio(makeCtx("tools")).text).toContain("not json");
  });

  it("formats MCP details with header names only", () => {
    mockedExecFileSync.mockReturnValue(
      JSON.stringify({
        url: "https://mcp.composio.dev/session",
        headers: { Authorization: "Bearer secret", "x-api-key": "secret" },
      }),
    );

    const result = slashComposio(makeCtx("mcp"));

    expect(result.text).toContain("https://mcp.composio.dev/session");
    expect(result.text).toContain("Authorization, x-api-key");
    expect(result.text).not.toContain("Bearer secret");
  });

  it("shows helper install guidance when helper is missing", () => {
    const err = Object.assign(new Error("missing"), { code: "ENOENT" });
    mockedExecFileSync.mockImplementation(() => {
      throw err;
    });

    expect(slashComposio(makeCtx("status")).text).toContain("not installed");
  });

  it("returns stderr from helper failures", () => {
    const err = Object.assign(new Error("failed"), { stderr: Buffer.from("bad api key") });
    mockedExecFileSync.mockImplementation(() => {
      throw err;
    });

    expect(slashComposio(makeCtx("status")).text).toContain("bad api key");
  });
});
