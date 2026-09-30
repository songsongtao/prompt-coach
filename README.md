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

A coding agent acts on the context it receives. If the goal, evidence, scope, or completion criteria are vague, it has to guess, which can lead to repeated questions, wrong files, broad changes, and hard-to-check results.

`prompt-coach` turns a rough request into a reviewed handoff: it keeps relevant context and failed attempts, exposes unknowns, makes constraints and acceptance criteria explicit, and lets you approve the exact prompt before execution. Coaching stays read-only. It helps most with debugging, implementation, review, and design tasks that carry several constraints; complete simple requests remain short.

| Command | Behavior |
| --- | --- |
| `/prompt-coach <idea or prompt>` | Start coaching, or revise the current request. |
| `/prompt-coach` | Start with an input invitation; reopen the choice dialog if a draft is awaiting review. |
| `/prompt-coach cancel` | End coaching and restore the previous tools without starting a task. |

Questions, improvement notes, and the review dialog follow the user's language: English or Simplified Chinese, with English as the fallback. Ask “continue in Chinese” or “请切换到英文” to switch. You can also request a specific language for the final prompt.

## How the coach improves a prompt

The coaching rules apply five practical principles:

1. **Less but precise** — keep high-relevance context and useful failed attempts; remove repetition and unrelated noise.
2. **Put priorities where they are easy to find** — organize the prompt as context, evidence, task, constraints, and output. Long background can bury a restriction as if it were ordinary information; placing key limits beside the task and finish line makes them easier to carry into the plan and checks.
3. **Facts before judgment** — separate confirmed facts, hypotheses, and missing evidence before suggesting a cause or solution.
4. **Make requirements concrete** — replace vague requests such as “analyze carefully” with files, checks, examples, boundaries, and an expected result.
5. **Define done** — state the scope, deliverables, and acceptance criteria so the task can finish without silently expanding.

Together they reduce noise, prevent unsupported assumptions, remove ambiguity, and narrow the expected output. The coach asks only for missing information instead of forcing every request through a fixed template.

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

## Development

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

The focused tests cover blocked writes, explicit execution approval, and session recovery. The npm package uses a `files` allowlist. Changes to user-facing behavior must update **both** this file and [README.zh-CN.md](README.zh-CN.md).

Official references: [OMP plugins](https://omp.sh/docs/plugins), [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), and the [Pi package directory](https://pi.dev/packages). The npm `pi-package` keyword enables directory discovery; publishing on npm and appearing in the directory are separate steps.

## Automated release

The repository includes a GitHub Actions workflow at `.github/workflows/npm-publish.yml`. It runs after a GitHub Release is **published**, checks that the release tag matches `package.json`, runs the checks and tests, previews the package contents, and publishes `@sonsong/prompt-coach` to npm.

Before the first automated release, configure npm Trusted Publishing for this package with GitHub Actions, repository `songsongtao/prompt-coach`, and workflow filename `npm-publish.yml`. The workflow uses OIDC and stores no npm token in the repository.

For each release:

1. Update `package.json`, `package-lock.json`, and `CHANGELOG.md` with a new version.
2. Run `npm run check`, `npm test`, and `npm pack --dry-run`.
3. Commit the changes, create and push an annotated `v<version>` tag.
4. Create and publish a GitHub Release for that tag.

The workflow publishes only a version that matches the release tag. A published npm version cannot be reused. Pi catalog indexing and npm download statistics update separately.

## License

[MIT](LICENSE) © 2026 songsongtao
