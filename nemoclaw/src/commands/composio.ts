// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Slash command handler for `/composio`.
 *
 * Wraps the `nemoclaw-composio` helper installed in the sandbox so users can
 * inspect their Composio Tool Router session from chat without dropping to a
 * shell. The helper itself reads COMPOSIO_API_KEY from the sandbox env (or
 * /tmp/nemoclaw-composio-api-key) and talks to api.composio.dev.
 */

import { execFileSync } from "node:child_process";
import type { PluginCommandContext, PluginCommandResult } from "../index.js";

const HELPER_BIN = "nemoclaw-composio";
const HELPER_TIMEOUT_MS = 15000;

type HelperResult = { ok: true; stdout: string } | { ok: false; message: string };

function runHelper(subcommand: string): HelperResult {
  try {
    const stdout = execFileSync(HELPER_BIN, [subcommand], {
      encoding: "utf-8",
      timeout: HELPER_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: Buffer | string; stdout?: Buffer | string };
    if (e.code === "ENOENT") {
      return {
        ok: false,
        message:
          "`nemoclaw-composio` is not installed in this sandbox. " +
          "Re-run `nemoclaw onboard` and enable Composio when prompted.",
      };
    }
    const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
    const stdout = typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "";
    const detail = (stderr || stdout || e.message || "unknown error").trim();
    return { ok: false, message: detail };
  }
}

export function slashComposio(ctx: PluginCommandContext): PluginCommandResult {
  const subcommand = ctx.args?.trim().split(/\s+/)[0] ?? "";

  switch (subcommand) {
    case "":
    case "help":
      return composioHelp();
    case "status":
      return composioStatus();
    case "tools":
      return composioTools();
    case "mcp":
      return composioMcp();
    default:
      return {
        text: `Unknown subcommand \`${subcommand}\`. Run \`/composio help\` for usage.`,
      };
  }
}

function composioHelp(): PluginCommandResult {
  return {
    text: [
      "**Composio Tool Router**",
      "",
      "Usage: `/composio <subcommand>`",
      "",
      "Subcommands:",
      "  `status` - Verify the API key is loaded and the session is reachable",
      "  `tools`  - List Tool Router meta tools available to the agent",
      "  `mcp`    - Show the MCP URL + headers for the current session",
      "",
      "To set or rotate the API key, re-run `nemoclaw onboard` on the host.",
      "",
      "Get a key at https://platform.composio.dev/settings",
    ].join("\n"),
  };
}

function composioStatus(): PluginCommandResult {
  const result = runHelper("status");
  if (!result.ok) return { text: `**Composio**: ${result.message}` };

  let parsed: { ok?: boolean; userId?: string; mcpAvailable?: boolean };
  try {
    parsed = JSON.parse(result.stdout) as { ok?: boolean; userId?: string; mcpAvailable?: boolean };
  } catch {
    return { text: `**Composio status**\n\n\`\`\`\n${result.stdout}\n\`\`\`` };
  }

  return {
    text: [
      "**Composio Status**",
      "",
      `Session: ${parsed.ok ? "ok" : "not ready"}`,
      `User ID: ${parsed.userId ?? "unknown"}`,
      `MCP available: ${parsed.mcpAvailable ? "yes" : "no"}`,
    ].join("\n"),
  };
}

function composioTools(): PluginCommandResult {
  const result = runHelper("tools");
  if (!result.ok) return { text: `**Composio**: ${result.message}` };

  let names: string[] = [];
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    if (Array.isArray(parsed)) {
      names = parsed
        .map((tool) => {
          if (tool && typeof tool === "object") {
            const t = tool as Record<string, unknown>;
            const name = t["name"] ?? t["slug"] ?? t["id"];
            return typeof name === "string" ? name : null;
          }
          return null;
        })
        .filter((value): value is string => value !== null);
    }
  } catch {
    return { text: `**Composio tools**\n\n\`\`\`\n${result.stdout.slice(0, 2000)}\n\`\`\`` };
  }

  if (names.length === 0) return { text: "**Composio**: no tools returned by the session." };

  const head = names.slice(0, 25);
  const more = names.length > head.length ? `\n\n…and ${String(names.length - head.length)} more` : "";
  return {
    text: ["**Composio Tools**", "", ...head.map((n) => `  - \`${n}\``), more]
      .filter(Boolean)
      .join("\n"),
  };
}

function composioMcp(): PluginCommandResult {
  const result = runHelper("mcp");
  if (!result.ok) return { text: `**Composio**: ${result.message}` };

  let parsed: { url?: string; headers?: Record<string, string> };
  try {
    parsed = JSON.parse(result.stdout) as { url?: string; headers?: Record<string, string> };
  } catch {
    return { text: `**Composio MCP**\n\n\`\`\`\n${result.stdout}\n\`\`\`` };
  }

  const headerNames = parsed.headers ? Object.keys(parsed.headers) : [];
  return {
    text: [
      "**Composio MCP**",
      "",
      `URL: ${parsed.url ?? "unknown"}`,
      `Auth headers: ${headerNames.length > 0 ? headerNames.join(", ") : "none"}`,
      "",
      "_Header values are redacted — point your MCP client at the URL above._",
    ].join("\n"),
  };
}
