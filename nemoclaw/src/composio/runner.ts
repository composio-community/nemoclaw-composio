// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";

const COMPOSIO_API_KEY_FILE = "/tmp/nemoclaw-composio-api-key";

type ComposioSession = {
  mcp?: {
    url?: string;
    headers?: Record<string, string>;
  };
  tools?: () => Promise<unknown>;
  execute?: (toolSlug: string, args?: Record<string, unknown>) => Promise<unknown>;
};

type ComposioClient = {
  create: (userId: string) => Promise<ComposioSession>;
};

function usage(): never {
  console.error(
    [
      "Usage: nemoclaw-composio <status|mcp|tools|call TOOL_SLUG>",
      "",
      "Environment:",
      "  COMPOSIO_API_KEY              Required. Passed by NemoClaw onboarding.",
      "  COMPOSIO_USER_ID              Optional stable user id. Defaults to nemoclaw-local.",
    ].join("\n"),
  );
  process.exit(2);
}

function readEntrypointEnv(name: string): string | undefined {
  try {
    const entries = readFileSync("/proc/1/environ", "utf8").split("\0");
    const prefix = `${name}=`;
    const entry = entries.find((value) => value.startsWith(prefix));
    return entry?.slice(prefix.length) || undefined;
  } catch {
    return undefined;
  }
}

function readRuntimeSecret(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function parseJsonObject(input: string): Record<string, unknown> {
  const trimmed = input.trim();
  if (trimmed.length === 0) return {};

  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

async function createSession(): Promise<{
  session: ComposioSession;
  userId: string;
}> {
  const apiKey =
    process.env.COMPOSIO_API_KEY ||
    readRuntimeSecret(COMPOSIO_API_KEY_FILE) ||
    readEntrypointEnv("COMPOSIO_API_KEY");
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not set. Re-run `nemoclaw onboard` and enable Composio.");
  }

  const { Composio } = (await import("@composio/core")) as {
    Composio: new (options?: { apiKey?: string }) => ComposioClient;
  };
  const userId = process.env.COMPOSIO_USER_ID || "nemoclaw-local";
  const composio = new Composio({ apiKey });
  const session = await composio.create(userId);

  return { session, userId };
}

async function main(): Promise<void> {
  const command = process.argv[2] || "status";
  if (command === "-h" || command === "--help") usage();
  if (!["status", "mcp", "tools", "call"].includes(command)) usage();

  const { session, userId } = await createSession();

  if (command === "status") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          userId,
          mcpAvailable: Boolean(session.mcp?.url),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "mcp") {
    if (!session.mcp?.url) {
      throw new Error("Composio session did not return an MCP URL.");
    }
    console.log(
      JSON.stringify(
        {
          url: session.mcp.url,
          headers: session.mcp.headers ?? {},
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "tools") {
    if (typeof session.tools !== "function") {
      throw new Error("Composio session does not expose native tools.");
    }
    console.log(JSON.stringify(await session.tools(), null, 2));
    return;
  }

  if (command === "call") {
    const toolSlug = process.argv[3];
    if (!toolSlug) usage();
    if (typeof session.execute !== "function") {
      throw new Error("Composio session does not expose tool execution.");
    }

    const args = parseJsonObject(await readStdin());
    console.log(JSON.stringify(await session.execute(toolSlug, args), null, 2));
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`nemoclaw-composio: ${message}`);
  process.exit(1);
});
