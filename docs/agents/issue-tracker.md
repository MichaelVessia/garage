# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all
operations.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Add or remove labels: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Infer `MichaelVessia/garage` from the repository remote.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Pull requests are implementation work, not incoming requests. Do not include
them in the issue triage queue.

## Skill terminology

When a skill says “publish to the issue tracker,” create a GitHub issue. When a
skill says “fetch the relevant ticket,” read the referenced GitHub issue,
including its comments and labels.

## Wayfinding operations

A wayfinding map is a GitHub issue labelled `wayfinder:map`. Its tickets are
child issues labelled `wayfinder:<type>`, where type is `research`, `prototype`,
`grilling`, or `task`.

Use native GitHub sub-issues and issue dependencies when available. Otherwise,
link children from a task list in the map and record blockers with a
`Blocked by: #<number>` line. Claim work by assigning the issue to the current
user. Resolve it by recording the answer, closing the child, and updating the
map’s decisions.
