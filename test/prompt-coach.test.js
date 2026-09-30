import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import promptCoach from "../extensions/prompt-coach.js";

const FINISH = "prompt_coach_finish";
const CONTEXT = "prompt-coach/context";
const originalTools = ["read", "write", "custom_lookup"];

function host(options = {}) {
  const h = {
    branch: structuredClone(options.branch ?? []),
    active: [...originalTools, FINISH],
    tools: new Map(), commands: new Map(), hooks: new Map(),
    messages: [], submissions: [], dialogs: [], notices: [],
    pending: false, idle: true, hasUI: true,
    choice: undefined,
    allTools: ["read", "grep", "find", "ls", "ask", "write", "edit", "bash", "python", "subagent"]
      .map((name) => ({ name, sourceInfo: { source: "builtin" } })),
  };
  const api = {
    registerCommand: (name, command) => h.commands.set(name, command),
    registerTool: (tool) => h.tools.set(tool.name, tool),
    on: (name, handler) => h.hooks.set(name, handler),
    getAllTools: () => h.allTools,
    getActiveTools: () => [...h.active],
    setActiveTools: async (names) => { h.active = [...names]; },
    appendEntry: (customType, data) => h.branch.push({ type: "custom", customType, data: structuredClone(data) }),
    sendMessage: (message) => {
      h.messages.push(message);
      h.branch.push({ type: "custom_message", ...structuredClone(message) });
    },
    sendUserMessage: (content) => h.submissions.push(content),
  };
  h.ctx = {
    get hasUI() { return h.hasUI; },
    isIdle: () => h.idle,
    hasPendingMessages: () => h.pending,
    sessionManager: { getBranch: () => h.branch },
    ui: {
      setStatus: (_name, status) => { h.status = status; },
      notify: (message) => h.notices.push(message),
      select: async (title, choices, options) => {
        h.dialogs.push({ title, choices, options });
        return typeof h.choice === "function" ? h.choice() : h.choice;
      },
    },
  };
  promptCoach(api);
  h.emit = (type, event = {}) => h.hooks.get(type)?.({ type, ...event }, h.ctx);
  h.command = (args = "") => h.commands.get("prompt-coach").handler(args, h.ctx);
  h.finish = (prompt = "Inspect the bug. Do not modify files.", language = "en") => h.tools.get(FINISH).execute("draft", { prompt, language, improvements: ["Clarified scope."] }, undefined, undefined, h.ctx);
  h.end = async () => {
    await h.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop" }] });
    await new Promise((resolve) => setTimeout(resolve, 30));
  };
  return h;
}

test("allowlist blocks write and bypass tools before they can mutate a real fixture", async () => {
  const dir = mkdtempSync(join(tmpdir(), "prompt-coach-"));
  const file = join(dir, "source.txt");
  writeFileSync(file, "original");
  try {
    const h = host();
    await h.emit("session_start");
    await h.command("Clarify a change");
    assert.deepEqual(h.active, ["read", "grep", "find", "ls", "ask", FINISH]);
    for (const toolName of ["write", "edit", "bash", "powershell", "python", "js", "subagent", "mcp_write", "unknown"]) {
      const result = await h.emit("tool_call", { toolName });
      if (!result?.block) writeFileSync(file, toolName);
      assert.equal(result?.block, true, toolName);
    }
    assert.equal(await h.emit("tool_call", { toolName: "read" }), undefined);
    h.allTools.find((tool) => tool.name === "read").sourceInfo.source = "extension";
    assert.equal((await h.emit("tool_call", { toolName: "read" })).block, true);
    for (const event of ["user_bash", "user_python"]) {
      const result = await h.emit(event, { command: "write a file" });
      assert.equal(result.result.exitCode, 1);
    }
    await h.finish();
    await h.end(); // Dismiss the review; restrictions still apply.
    assert.equal((await h.emit("tool_call", { toolName: "write" })).block, true);
    assert.equal(readFileSync(file, "utf8"), "original");
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
});

test("only Execute submits the exact displayed draft once and restores prior tools", async () => {
  const h = host();
  await h.emit("session_start");
  await h.command();
  const prompt = "Fix this example:\n```js\nconst value = `keep me`;\n```\nPreserve whitespace.\n";
  await h.finish(prompt);
  assert.equal(h.submissions.length, 0);
  h.choice = "Execute";
  await h.end();
  assert.ok(h.messages[0].content.includes(prompt));
  assert.ok(h.submissions[0].endsWith(prompt));
  assert.deepEqual(h.active, originalTools);
  assert.equal(h.status, undefined);
  await h.end();
  assert.equal(h.submissions.length, 1);
  assert.equal((await h.emit("tool_call", { toolName: FINISH })).block, true);
});

test("refine, keep, dismiss, interruption, and noninteractive mode never execute", async () => {
  for (const choice of ["Continue refining", "Keep prompt only", undefined]) {
    const h = host();
    await h.emit("session_start");
    await h.command();
    await h.finish();
    h.choice = choice;
    await h.end();
    assert.equal(h.submissions.length, 0);
    assert.equal(h.active.includes("write"), choice === "Keep prompt only");
  }
  for (const reason of ["aborted", "error"]) {
    const h = host();
    await h.command();
    await h.finish();
    h.choice = "Execute";
    await h.emit("agent_end", { messages: [{ role: "assistant", stopReason: reason }] });
    assert.equal(h.dialogs.length, 0);
    assert.equal(h.submissions.length, 0);
    assert.equal(h.active.includes("write"), false);
  }
  const h = host();
  h.hasUI = false;
  await h.command();
  const result = await h.finish();
  await h.end();
  assert.ok(result.content[0].text.includes("Inspect the bug. Do not modify files."));
  assert.equal(h.dialogs.length, 0);
  assert.equal(h.submissions.length, 0);
});

test("queued input and stale dialogs cannot authorize a draft", async () => {
  const h = host();
  await h.command();
  await h.finish();
  h.pending = true;
  h.choice = "Execute";
  await h.end();
  assert.equal(h.submissions.length, 0);
  h.pending = false;
  let resolve;
  h.choice = () => new Promise((done) => { resolve = done; });
  const review = h.command();
  await new Promise((done) => setTimeout(done, 20));
  await h.emit("input", { source: "interactive", text: "Change the scope" });
  resolve("Execute");
  await review;
  assert.equal(h.submissions.length, 0);
  assert.equal(h.active.includes("write"), false);
});

test("review waits for real host idle and is cancelled by new input", async () => {
  const h = host();
  await h.command();
  await h.finish();
  h.idle = false;
  await h.end();
  assert.equal(h.messages.length, 0);
  assert.equal(h.dialogs.length, 0);
  await h.emit("input", { source: "interactive", text: "Revise first" });
  h.idle = true;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(h.dialogs.length, 0);
});

test("reload and branch navigation restore state without replaying execution", async () => {
  const h = host();
  await h.emit("session_start");
  await h.command();
  await h.finish("检查错误，不改代码。", "zh-CN");
  const reviewBranch = structuredClone(h.branch);
  await h.emit("session_shutdown");
  assert.deepEqual(h.active, originalTools);
  const resumed = host({ branch: reviewBranch });
  await resumed.emit("session_start");
  assert.equal(resumed.active.includes("write"), false);
  assert.equal(resumed.dialogs.length, 0);
  await resumed.command();
  assert.ok(resumed.dialogs[0].choices.includes("执行"));
  assert.equal(resumed.submissions.length, 0);
  resumed.branch = [];
  await resumed.emit("session_tree");
  assert.deepEqual(resumed.active, originalTools);
  resumed.branch = reviewBranch;
  await resumed.emit("session_tree");
  assert.equal(resumed.active.includes("write"), false);
  await resumed.command("cancel");
  assert.deepEqual(resumed.active, originalTools);
  const ended = host({ branch: resumed.branch });
  await ended.emit("session_start");
  assert.deepEqual(ended.active, originalTools);
  assert.equal(ended.submissions.length, 0);
});

test("coaching context is present while active and removed after leaving", async () => {
  const h = host();
  h.idle = false;
  await h.command("ignored");
  assert.equal(h.submissions.length, 0);
  h.idle = true;
  await h.command();
  const instruction = (await h.emit("before_agent_start")).message;
  assert.equal(instruction.customType, CONTEXT);
  const user = { role: "user", content: "task" };
  const context = [instruction, user, instruction];
  assert.deepEqual((await h.emit("context", { messages: context })).messages, [user, instruction]);
  await h.command("cancel");
  assert.deepEqual((await h.emit("context", { messages: context })).messages, [user]);
});
