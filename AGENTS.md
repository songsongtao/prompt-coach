# Development conventions

- Keep changes small and reuse the shared extension and coaching rules.
- Update README.md and README.zh-CN.md together when user-facing behavior changes.
- Keep tests focused on read-only enforcement, execution authorization, and session recovery.
- Never add model-controlled execution approval or enable shell/script tools during coaching.

## Repository and release workflow

- Inspect `git status` before editing and preserve unrelated worktree changes.
- Keep the shared extension and `coaching.md` as the source of behavior. When user-facing behavior or documentation changes, update `README.md` and `README.zh-CN.md` together.
- For a release, update `package.json`, `package-lock.json`, and `CHANGELOG.md` with the next version. Keep the package name, Pi/OMP manifests, and `files` allowlist consistent.
- Before committing, run `git diff --check`, `npm run check`, `npm test`, and `npm pack --dry-run`. Confirm the tarball contains only intended public files.
- Commit the reviewed changes, create an annotated `v<version>` tag, and push the branch and tag to `origin`. For normal releases, then publish a GitHub Release for that tag; `.github/workflows/npm-publish.yml` runs the checks and publishes to npm through Trusted Publishing.
- Configure npm Trusted Publishing once for the exact repository and workflow filename before relying on automatic publishing. The workflow uses OIDC and does not need an npm token secret.
- For a deliberate manual recovery outside the workflow, publish the scoped package through the public npm registry with browser authentication when required:

  ```bash
  npm publish --access public --auth-type=web --registry=https://registry.npmjs.org/
  ```

- After publishing, verify the version with `npm view`, then check the npm package page and the Pi package page. npm download statistics and Pi catalog indexing are delayed and must be reported separately from publication success.

## Privacy and publishing safety

- Never put email addresses, passwords, OTPs, access tokens, auth URLs, `.npmrc` contents, session IDs, private paths, screenshots, logs, or other credentials in tracked files, commit messages, package contents, or command output.
- Do not print or inspect credential files during routine checks. Use browser authentication or an already configured credential helper; never paste a token into a command, README, issue, or release note.
- Review `git diff`, `npm pack --dry-run`, and the published file list for local paths, private notes, test fixtures, and generated artifacts before making a public release.
- Treat GitHub source, npm publication, and Pi catalog indexing as separate public actions. Record only public version and URL evidence in project notes.
