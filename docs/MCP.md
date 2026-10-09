# gemini-ai-chatbot MCP server

This application exposes its core operations through a dependency-free
[Model Context Protocol](https://modelcontextprotocol.io) server, so agentic
clients can drive it as first-class tools.

- **Transport:** stdio (newline-delimited JSON-RPC 2.0)
- **Server:** `mcp-server/server.mjs`
- **Config:** `mcp-server/server_config.json` — tools are derived from this file
- **Client config:** `.mcp.json` at the repository root
- **Tests:** `tests/test_mcp_server.py` (protocol-level, no MCP client needed)

## Exposed tools

| Tool | Purpose |
|------|---------|
| `app_info` | Application + server metadata |
| `run_cli` | Run the application's CLI (when a CLI entry exists) |
| `http_<method>_<path>` | One per discovered HTTP route (calls the app's API) |
| `list_pages` / `get_page` / `search_content` | Static site content tools |

## Quick start

```bash
node mcp-server/server.mjs
```

Then add `{"mcpServers": {"gemini-ai-chatbot": {"command": "node", "args": ["mcp-server/server.mjs"]}}}`
to your MCP client's configuration, or use the repository's `.mcp.json`.

## Verify

```bash
python3 -m unittest discover -s tests -p "test_mcp_server.py" -v
```

The tests speak the MCP protocol directly (initialize -> tools/list ->
tools/call), so they validate the server without an MCP client.
