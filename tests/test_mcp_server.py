"""Smoke tests for the gemini-ai-chatbot MCP server (mcp-server/server.mjs).

Speaks MCP JSON-RPC 2.0 directly over stdio, so these tests verify the server is
a valid MCP endpoint without needing an MCP client installed.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(REPO_ROOT, "mcp-server/server.mjs")
RUNNER = os.environ.get("MCP_TEST_RUNNER", sys.executable)
TIMEOUT = 60


class MCPTest(unittest.TestCase):
    def setUp(self):
        self.proc = subprocess.Popen(
            [RUNNER, SERVER],
            cwd=REPO_ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def tearDown(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        finally:
            for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
                try:
                    if stream:
                        stream.close()
                except Exception:
                    pass

    def rpc(self, method, params=None, req_id=1):
        msg = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            msg["params"] = params
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        self.proc.stdout.flush()
        line = self.proc.stdout.readline()
        self.assertTrue(line, "server closed stdout without a response")
        return json.loads(line)

    def test_initialize(self):
        resp = self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}})
        self.assertIn("tools", resp["result"]["capabilities"])
        self.assertIn("serverInfo", resp["result"])

    def test_tools_list(self):
        self.rpc("initialize", {})
        resp = self.rpc("tools/list", {}, req_id=2)
        names = {t["name"] for t in resp["result"]["tools"]}
        self.assertIn("app_info", names)
        self.assertTrue(len(names) >= 1)
        for tool in resp["result"]["tools"]:
            self.assertEqual(tool["inputSchema"]["type"], "object")

    def test_tools_call_app_info(self):
        self.rpc("initialize", {})
        resp = self.rpc("tools/call", {"name": "app_info", "arguments": {}}, req_id=3)
        self.assertFalse(resp["result"]["isError"])
        text = resp["result"]["content"][0]["text"]
        self.assertIn("mcp_server", text)

    def test_unknown_method_is_reported(self):
        resp = self.rpc("does/not/exist", {}, req_id=4)
        self.assertEqual(resp["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()