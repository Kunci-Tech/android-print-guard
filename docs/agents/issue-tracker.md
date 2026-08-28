# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve an ambiguous bare number by trying `gh pr view <number>` and then `gh issue view <number>`.

## Skill operations

- When a skill says **publish to the issue tracker**, create a GitHub issue.
- When a skill says **fetch the relevant ticket**, run `gh issue view <number> --comments`.

## Wayfinding operations

- The map is one issue labeled `wayfinder:map`.
- Child tickets use GitHub sub-issues where available; otherwise link them through a task list and `Part of #<map>`.
- Blocking uses GitHub native issue dependencies where available; otherwise use a `Blocked by: #<n>` line.
- The frontier contains open, unassigned children with no open blocker.
- Claim work by assigning the issue to the current user.
- Resolve a child by commenting with the answer, closing it, and recording the decision pointer on the map.
