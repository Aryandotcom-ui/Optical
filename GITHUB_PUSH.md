# Pushing to GitHub

The repository's remote is `origin` (`github.com/Aryandotcom-ui/Optical`). All work for this
build is on the branch `claude/bold-sagan-iwwvg0`, with an open pull request into `main`.

## Day to day

```sh
git switch -c feat/short-description          # one branch per change
pnpm check                                    # lint, typecheck, test, build
git commit -m "feat(web): describe the change" # Conventional Commits; a hook formats staged files
git push -u origin feat/short-description
```

Then open a pull request into `main`. CI runs format, lint, typecheck, unit and integration tests
with coverage thresholds, the build, the JavaScript budget, the end-to-end suite (desktop,
mobile and fake-camera try-on) and Lighthouse budgets; all must pass before merging.

## Before the first push from a new machine

- Authenticate with the GitHub CLI (`gh auth login`) or an SSH key; never put a token in a
  remote URL or a file in the repository.
- Copy `.env.example` to `.env` (`pnpm run setup` does this); `.env` and
  `infra/deploy/production.env` are git-ignored. Check with `git status` that no secret is staged.
- Optional: enable branch protection on `main` (require the CI checks and one review).

## Releasing

Merge to `main`, run `pnpm preflight`, build the images and deploy as described in
[`infra/deploy/DEPLOYMENT.md`](infra/deploy/DEPLOYMENT.md). Tag the release (`git tag v1.0.0 &&
git push origin v1.0.0`) so the deployed images can be traced to a commit.
