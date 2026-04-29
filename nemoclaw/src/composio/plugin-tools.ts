// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import type { OpenClawPluginApi, PluginValue } from "../index.js";

const HELPER_BIN = "nemoclaw-composio";
const HELPER_TIMEOUT_MS = 30000;

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

type OpenAiToolDefinition = {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: JsonSchemaObject;
  };
};

function runHelper(args: string[], input?: Record<string, unknown>): string {
  return execFileSync(HELPER_BIN, args, {
    encoding: "utf-8",
    input: input ? JSON.stringify(input) : undefined,
    timeout: HELPER_TIMEOUT_MS,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function loadComposioToolDefinitions(): OpenAiToolDefinition[] {
  const raw = runHelper(["tools"]);
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as OpenAiToolDefinition[]) : [];
}

function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function executeComposioTool(toolName: string, params: Record<string, PluginValue>): string {
  const raw = runHelper(["call", toolName], params as Record<string, unknown>);
  if (raw.length === 0) return "Composio returned no output.";

  try {
    return stringifyToolResult(JSON.parse(raw));
  } catch {
    return raw;
  }
}

export function registerComposioAgentTools(api: OpenClawPluginApi): void {
  if (typeof api.registerTool !== "function") {
    api.logger.warn("[Composio] OpenClaw plugin host does not expose registerTool");
    return;
  }

  let definitions: OpenAiToolDefinition[];
  try {
    definitions = loadComposioToolDefinitions();
  } catch (err) {
    api.logger.warn(
      `[Composio] Could not load integration schemas: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }

  for (const definition of definitions) {
    const fn = definition.function;
    if (!fn?.name || !fn.description || !fn.parameters) continue;

    api.registerTool({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
      async execute(_id: string, params: Record<string, PluginValue>) {
        return {
          content: [
            {
              type: "text",
              text: executeComposioTool(fn.name as string, params),
            },
          ],
        };
      },
    });
  }

  api.logger.info(`[Composio] Registered ${String(definitions.length)} integration tools`);
}
