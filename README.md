# prompt-coach

English | [简体中文](README.zh-CN.md)

Turn a rough coding request into a clear, actionable prompt in **Pi** and **Oh My Pi (OMP)**. Clarify first, inspect relevant evidence, review the complete prompt, then choose whether to execute it in the current session.

## Install

```bash
# Pi
pi install npm:@sonsong/prompt-coach

# OMP
omp plugin install @sonsong/prompt-coach
```

Restart the host, or reload its extensions if supported. Tested with **Pi 0.87.0** and **OMP 18.4.2**. Both hosts load the same JavaScript extension and shared coaching rules. No separate model account or API key is required: coaching uses the host's existing model and context.

## Use

Start from an idle session:

```text
/prompt-coach The login page sometimes fails. Help me describe a useful debugging task.
```

The coach reuses the conversation and can read or search relevant project files. It asks at most 1–3 important questions per round, using a built-in question tool when available. Complete requests go straight to a draft. Say **“draft now”**, **“skip”**, or describe a revision at any point; unanswered questions remain explicit unknowns.

For example, a vague debugging request becomes a prompt with the reproduction steps, expected and actual behavior, evidence, failed attempts, scope, and acceptance criteria. A short, complete request stays short.

## Why it matters

A coding agent can only act on what the current context makes clear. When a request is vague, the model has to guess the goal, the relevant evidence, the allowed scope, and what counts as finished. Those guesses lead to repeated questions, wrong files, broad changes, and results that are difficult to verify.

`prompt-coach` turns that rough request into a compact handoff before any task starts. It makes the target, evidence, constraints, and finish line visible; keeps useful failed attempts; exposes unknowns before they become assumptions; and lets you approve the exact prompt that will be submitted. The coaching phase stays read-only, so improving the prompt cannot change project files. This is especially useful for debugging, implementation, review, and design tasks that carry several constraints across a conversation. Simple, complete requests remain short.

| Command | Behavior |
| --- | --- |
| `/prompt-coach <idea or prompt>` | Start coaching, or revise the current request. |
| `/prompt-coach` | Start with an input invitation; reopen the choice dialog if a draft is awaiting review. |
| `/prompt-coach cancel` | End coaching and restore the previous tools without starting a task. |

Questions, improvement notes, and the review dialog follow the user's language: English or Simplified Chinese, with English as the fallback. Ask “continue in Chinese” or “请切换到英文” to switch. You can also request a specific language for the final prompt.

## Principles from `提示词工程.md`

The shared coaching rules turn the five principles in the project notes into a repeatable workflow:

1. **Less but precise** — keep high-relevance context and useful failed attempts; remove repetition and unrelated noise.
2. **Put priorities where they are easy to find** — organize the prompt as context, evidence, task, constraints, and output, then keep the most important limits close to the task and finish line.
3. **Facts before judgment** — separate confirmed facts, hypotheses, and missing evidence before suggesting a cause or solution.
4. **Make requirements concrete** — replace vague requests such as “analyze carefully” with files, checks, examples, boundaries, and an expected result.
5. **Define done** — state the scope, deliverables, and acceptance criteria so the task can finish without silently expanding.

These practices apply the notes' model concepts in a usable form: relevant context guides attention, clear placement keeps priorities visible, facts shape a reliable working state, concrete examples reduce semantic ambiguity, and explicit constraints narrow the possible output. The coach asks only for missing information instead of forcing every request through a fixed template.

## Review and execute

The extension displays a copyable, complete prompt and up to three improvement notes before opening the host's native choice dialog.

| Choice | Result |
| --- | --- |
| **Execute** | End coaching, restore the previous tool configuration, and submit the displayed prompt to the current session once. Existing host permissions and plan-mode rules still apply. |
| **Continue refining** | Remain read-only and wait for your changes. The revised draft needs a new confirmation. This is the default selection. |
| **Keep prompt only** | Retain the draft in the conversation and end coaching without starting the task. |
| **Dismiss / interrupt** | Remain read-only with the draft awaiting review. Reopen it with `/prompt-coach`. |

Typing another message invalidates the previous draft's confirmation. The internal `prompt_coach_finish` tool only submits a draft; it cannot approve or start execution. Without an interactive UI, the extension only displays the draft and never executes automatically.

## Read-only boundary and session recovery

While coaching or awaiting review, the extension exposes only verified built-in read, search, directory-listing, and question tools, plus its own draft-submission tool. It blocks calls to editing, writing, shell, scripts, subagents, and unknown tools, including third-party tools that reuse an allowed name. Direct user shell commands and OMP's direct Python commands are also blocked during coaching.

The phase, draft, and previous active tools are recorded in the host's session history. Reloading, resuming, or switching branches restores the state for that branch without replaying an execution request. Use `cancel`, **Execute**, or **Keep prompt only** to leave coaching. No draft file is created in your project.

This boundary covers the host tool and direct-command entry points while the extension is loaded. It is not an operating-system sandbox for other processes or other extensions' own code. A tool override is excluded from the read-only allowlist. Install trusted extensions and avoid changing host modes during coaching.

## Coaching principles

The shared [coaching rules](coaching.md) apply five practical principles:

1. Keep relevant context and useful failed attempts; remove repetition.
2. Make the task and important constraints easy to find.
3. Distinguish established facts, hypotheses, and missing evidence.
4. Turn vague requests into concrete requirements or examples.
5. Define scope, deliverables, and acceptance criteria without enlarging the task.

The focus adapts to implementation, debugging, review, or design. Questions are driven by missing information, not a mandatory form.

## Development

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

The focused tests cover blocked writes, explicit execution approval, and session recovery. The npm package uses a `files` allowlist. Changes to user-facing behavior must update **both** this file and [README.zh-CN.md](README.zh-CN.md).

Official references: [OMP plugins](https://omp.sh/docs/plugins), [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), and the [Pi package directory](https://pi.dev/packages). The npm `pi-package` keyword enables directory discovery; publishing on npm and appearing in the directory are separate steps.

## License

[MIT](LICENSE) © 2026 songsongtao
