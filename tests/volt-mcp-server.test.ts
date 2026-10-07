import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-mcp-server-"));
const { db } = await import("@/lib/db.ts");
const { createVoltMcpServer } = await import("@/lib/volt-mcp-server.ts");

test("MCP publishes six focused read-only tools", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createVoltMcpServer(db);
  const client = new Client({ name: "test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
    "get_progress_summary", "get_recent_workouts", "get_records", "get_today_summary", "get_training_load", "get_week_plan",
  ]);
  assert.ok(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false));
  const result = await client.callTool({ name: "get_week_plan", arguments: { date: "2026-09-06" } });
  assert.equal(result.isError, undefined);
  await client.close();
  await server.close();
});

test("MCP enforces OAuth scopes at the tool boundary", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createVoltMcpServer(db, ["volt.training.read"]);
  const client = new Client({ name: "test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.callTool({ name: "get_progress_summary", arguments: { date: "2026-09-06" } });
  assert.equal(result.isError, true);
  await client.close();
  await server.close();
});
