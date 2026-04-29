<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Composio Tools

Composio is already configured in this NemoClaw sandbox. Do not ask the user for a
Composio API key unless `nemoclaw-composio status` reports that `COMPOSIO_API_KEY`
is missing.

Use the installed helper command:

```bash
nemoclaw-composio status
nemoclaw-composio tools
nemoclaw-composio mcp
```

`nemoclaw-composio tools` returns Composio Tool Router meta tools. Use those meta
tools to search for available toolkits, inspect auth/connection state, and execute
the concrete Composio tool the user needs.
