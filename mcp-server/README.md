# gemini-ai-chatbot MCP server

Dependency-free [Model Context Protocol](https://modelcontextprotocol.io)
server. Speaks JSON-RPC 2.0 over stdio and implements the `tools` capability, so
any MCP client (Claude Desktop, opencode, Cursor, VS Code, ...) can drive this
application as tools.

## Run

```bash
node mcp-server/server.mjs
```

## Tools

Tools are derived from `mcp-server/server_config.json` and include `app_info`
plus (depending on the application) `run_cli`, one tool per discovered HTTP
route, and static-content tools.

## Client configuration

The repository root includes `.mcp.json`:

```json
{
  "mcpServers": {
    "gemini-ai-chatbot": {
      "command": "node",
      "args": [
        "mcp-server/server.mjs"
      ]
    }
  }
}
```

## Tests

```bash
python3 -m unittest discover -s tests -p "test_mcp_server.py" -v
```
