import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";

const RULES = readFileSync(new URL("../coaching.md", import.meta.url), "utf8");
const STATE = "prompt-coach/state";
const CONTEXT = "prompt-coach/context";
const FINISH = "prompt_coach_finish";
const READ_TOOLS = new Set(["read", "grep", "find", "glob", "ls", "ask", "questionnaire"]);
const TEXT = {
  en: {
    status: "prompt-coach · read only",
    busy: "Wait for the current turn and queued messages to finish before using /prompt-coach.",
    start: "Describe the task or paste the prompt you want to improve.",
    blocked: "Prompt coaching is read-only. Review the draft and choose Execute, or exit with /prompt-coach cancel.",
    title: "prompt-coach — what next?",
    execute: "Execute",
    refine: "Continue refining",
    keep: "Keep prompt only",
    stopped: "Prompt coaching ended. No task was started.",
    draft: "Final prompt",
    improvements: "What improved",
    ready: "Draft saved. End this turn; the extension will display it for user review. Do not execute the task.",
    noUI: "Draft ready. Automatic execution is disabled without an interactive review dialog.",
    handoff: "Prompt coaching has ended. I approved execution of the exact prompt below. Follow the existing host permissions and execute this task:",
  },
  "zh-CN": {
    status: "prompt-coach · 只读引导",
    busy: "请等当前任务和排队消息结束后再使用 /prompt-coach。",
    start: "请描述任务，或粘贴你想完善的提示词。",
    blocked: "提示词引导期间只读。请在成稿后选择执行，或用 /prompt-coach cancel 退出。",
    title: "prompt-coach — 接下来做什么？",
    execute: "执行",
    refine: "继续完善",
    keep: "仅保留提示词",
    stopped: "提示词引导已结束，未启动任务。",
    draft: "最终提示词",
    improvements: "改进说明",
    ready: "成稿已保存。请结束本轮，由扩展展示成稿供用户确认，不要执行任务。",
    noUI: "成稿已就绪。没有交互式确认界面时不会自动执行。",
    handoff: "提示词引导已结束。我已确认执行下方这份完整提示词。请遵守宿主现有权限，执行此任务：",
  },
};

function languageOf(text, fallback = "en") {
  if (/\p{Script=Han}/u.test(text)) return "zh-CN";
  return /[a-z]/i.test(text) ? "en" : fallback;
}

function lastUserText(ctx) {
  const entry = ctx.sessionManager.getBranch().findLast((item) => item.type === "message" && item.message.role === "user");
  const content = entry?.message.content;
  return typeof content === "string" ? content : (content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
}

function renderDraft(draft, text) {
  // A longer fence preserves prompts that already contain Markdown code blocks.
  const runs = draft.prompt.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  const notes = draft.improvements.length ? `\n\n**${text.improvements}**\n\n${draft.improvements.map((note) => `- ${note}`).join("\n")}` : "";
  return `**${text.draft}**\n\n${fence}markdown\n${draft.prompt}\n${fence}${notes}`;
}

export default function promptCoach(pi) {
  let state = { stage: "idle", language: "en" };
  let dialog;
  let reviewTimer;
  let pendingReview = false;

  const active = () => state.stage !== "idle";
  const text = () => TEXT[state.language];
  const withoutFinish = (names) => names.filter((name) => name !== FINISH);
  const save = () => pi.appendEntry(STATE, state);

  function closeDialog() {
    clearTimeout(reviewTimer);
    reviewTimer = undefined;
    dialog?.abort();
    dialog = undefined;
  }

  function readTools() {
    return pi.getAllTools()
      .filter((tool) => READ_TOOLS.has(tool.name) && tool.sourceInfo?.source === "builtin")
      .map((tool) => tool.name);
  }

  async function restrict(ctx) {
    await pi.setActiveTools([...readTools(), FINISH]);
    ctx.ui.setStatus("prompt-coach", text().status);
  }

  async function leave(ctx) {
    const previousTools = state.previousTools;
    closeDialog();
    pendingReview = false;
    // Keep the guard until restoration succeeds. Never replace a restricted host
    // configuration with a hard-coded list of write-capable tools.
    await pi.setActiveTools(previousTools ?? withoutFinish(pi.getActiveTools()));
    state = { stage: "idle", language: state.language };
    save();
    ctx.ui.setStatus("prompt-coach", undefined);
  }

  async function restore(_event, ctx) {
    const previousTools = state.previousTools;
    closeDialog();
    pendingReview = false;
    const saved = ctx.sessionManager.getBranch().findLast((entry) => entry.type === "custom" && entry.customType === STATE);
    state = saved ? structuredClone(saved.data) : { stage: "idle", language: languageOf(lastUserText(ctx)) };
    if (active()) {
      await restrict(ctx);
    } else {
      await pi.setActiveTools(previousTools ?? withoutFinish(pi.getActiveTools()));
      ctx.ui.setStatus("prompt-coach", undefined);
    }
  }

  async function review(ctx) {
    if (state.stage !== "review" || dialog) return;
    const reviewed = state;
    const words = text();
    const controller = new AbortController();
    dialog = controller;
    try {
      const reviewId = randomUUID();
      pi.sendMessage({ customType: "prompt-coach/draft", content: renderDraft(reviewed.draft, words), display: true, details: { reviewId } }, { triggerTurn: false });
      if (!ctx.hasUI) {
        ctx.ui.notify(words.noUI, "info");
        return;
      }
      // sendMessage is fire-and-forget. Wait for this exact display entry to
      // reach the transcript before opening a dialog, including on OMP.
      const deadline = Date.now() + 5000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (controller.signal.aborted || state !== reviewed) return;
        if (ctx.sessionManager.getBranch().some((entry) => entry.type === "custom_message" && entry.details?.reviewId === reviewId)) break;
        if (Date.now() >= deadline) throw new Error("Could not display the draft. Reopen it with /prompt-coach.");
      } while (true);
      // Refining is the default selection. Execution always requires a deliberate choice.
      const choice = await ctx.ui.select(words.title, [words.refine, words.execute, words.keep], { signal: controller.signal });
      if (controller.signal.aborted || state !== reviewed) return;
      if (choice === words.execute) {
        if (!ctx.isIdle() || ctx.hasPendingMessages()) {
          ctx.ui.notify(words.busy, "warning");
          return;
        }
        await leave(ctx);
        pi.sendUserMessage(`${words.handoff}\n\n${reviewed.draft.prompt}`);
      } else if (choice === words.keep) {
        await leave(ctx);
        ctx.ui.notify(words.stopped, "info");
      } else if (choice === words.refine) {
        state = { ...state, stage: "coaching", draft: undefined };
        save();
        ctx.ui.notify(words.start, "info");
      }
    } finally {
      if (dialog === controller) dialog = undefined;
    }
  }

  pi.registerCommand("prompt-coach", {
    description: "Improve a coding prompt with read-only coaching; cancel to exit.",
    handler: async (args, ctx) => {
      if (!ctx.isIdle() || ctx.hasPendingMessages()) {
        ctx.ui.notify(text().busy, "warning");
        return;
      }
      const input = args.trim();
      if (input === "cancel") {
        await leave(ctx);
        ctx.ui.notify(text().stopped, "info");
        return;
      }
      if (state.stage === "review" && !input) {
        await review(ctx);
        return;
      }
      const previousTools = active() ? state.previousTools : withoutFinish(pi.getActiveTools());
      closeDialog();
      pendingReview = false;
      state = {
        stage: "coaching",
        language: languageOf(input || lastUserText(ctx), state.language),
        previousTools,
      };
      save();
      await restrict(ctx);
      if (input) {
        pi.sendUserMessage(input);
        if (!ctx.hasUI) {
          // Print-mode hosts would otherwise exit while this submitted turn starts.
          await new Promise((resolve) => setTimeout(resolve, 0));
          while (!ctx.isIdle()) await new Promise((resolve) => setTimeout(resolve, 25));
          await ctx.waitForIdle();
        }
      } else ctx.ui.notify(text().start, "info");
    },
  });

  pi.registerTool({
    name: FINISH,
    label: "Prompt coach draft",
    description: "Submit a complete coached prompt for user review. Saves a draft; never authorizes execution. Only available during /prompt-coach.",
    parameters: Type.Object({
      prompt: Type.String({ minLength: 1, description: "The full standalone task prompt." }),
      improvements: Type.Array(Type.String({ minLength: 1 }), { maxItems: 3 }),
      language: Type.Union([Type.Literal("en"), Type.Literal("zh-CN")]),
    }),
    approval: "read",
    defaultInactive: true,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      if (!active()) throw new Error("Start /prompt-coach before submitting a draft.");
      if (signal?.aborted) throw new Error("Draft submission was cancelled.");
      if (!params.prompt.trim()) throw new Error("The draft must not be blank.");
      closeDialog();
      state = {
        ...state,
        stage: "review",
        language: params.language,
        draft: { prompt: params.prompt, improvements: [...params.improvements] },
      };
      save();
      pendingReview = true;
      const result = ctx?.hasUI === false ? `${renderDraft(state.draft, text())}\n\n${text().noUI}` : text().ready;
      return { content: [{ type: "text", text: result }], details: { stage: "review" } };
    },
  });

  pi.on("tool_call", (event) => {
    if (active() && event.toolName !== FINISH && !readTools().includes(event.toolName)) {
      return { block: true, reason: text().blocked };
    }
    if (!active() && event.toolName === FINISH) {
      return { block: true, reason: "Start /prompt-coach before submitting a draft." };
    }
  });

  // User-entered shell/Python commands bypass the model's tool_call event.
  for (const name of ["user_bash", "user_python"]) pi.on(name, () => {
    if (!active()) return;
    const output = text().blocked;
    const bytes = Buffer.byteLength(output);
    return { result: {
      output, exitCode: 1, cancelled: false, truncated: false,
      totalLines: 1, outputLines: 1, totalBytes: bytes, outputBytes: bytes,
      ...(name === "user_python" ? { displayOutputs: [], stdinRequested: false } : {}),
    } };
  });

  pi.on("input", (event) => {
    if (!active() || event.source === "extension") return;
    closeDialog();
    pendingReview = false;
    state = { ...state, stage: "coaching", draft: undefined, language: languageOf(event.text, state.language) };
    save();
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!active()) return;
    await restrict(ctx);
    const output = ctx.hasUI ? "" : "\nNo interactive UI is available. After submitting the draft, reproduce the complete prompt and improvement notes in your final response. Do not execute it.";
    return { message: { customType: CONTEXT, content: RULES + output, display: false } };
  });

  // Only filter our transient instructions; retain all user messages and evidence.
  pi.on("context", (event) => {
    const latest = active() ? event.messages.findLastIndex((message) => message.customType === CONTEXT) : -1;
    return { messages: event.messages.filter((message, index) => message.customType !== CONTEXT || index === latest) };
  });

  pi.on("agent_end", (event, ctx) => {
    const last = event.messages?.findLast((message) => message.role === "assistant");
    if (last?.stopReason === "aborted" || last?.stopReason === "error") {
      closeDialog();
      pendingReview = false;
      return;
    }
    if (!pendingReview) return;
    pendingReview = false;
    if (!ctx.hasUI) return; // The model repeats the full tool result in print mode.
    const reviewed = state;
    // agent_end runs before either host is idle. Returning lets the host settle;
    // sending a display message while busy can accidentally queue another turn.
    const whenIdle = async () => {
      if (state !== reviewed) return;
      if (!ctx.isIdle()) {
        reviewTimer = setTimeout(whenIdle, 25);
        return;
      }
      reviewTimer = undefined;
      try {
        await review(ctx);
      } catch (error) {
        ctx.ui.notify(String(error), "error");
      }
    };
    reviewTimer = setTimeout(whenIdle, 0);
  });

  for (const name of ["session_start", "session_switch", "session_branch", "session_tree"]) pi.on(name, restore);
  pi.on("session_shutdown", async (_event, ctx) => {
    closeDialog();
    pendingReview = false;
    if (active()) await pi.setActiveTools(state.previousTools);
    ctx.ui.setStatus("prompt-coach", undefined);
  });
}
