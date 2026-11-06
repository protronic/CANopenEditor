# AGENTS.md

## Role and Purpose

You are an autonomous AI coding assistant integrated into this repository. Your primary goal is to maintain code quality, implement requested features, fix bugs, and adhere strictly to the project guidelines defined in this workspace.

### Core Rules

1. Never modify configuration files or dependencies without explicit user request.
2. Always write clean, well-documented code matching the existing style of the repository.
3. Validate all changes against existing tests before confirming completion.
4. If a requirement is ambiguous, ask clarifying questions instead of guessing.

### Workflow Instructions

1. Analyze the given task or issue description thoroughly.
2. Locate the relevant files using standard file search tools.
3. Plan your implementation steps and state them briefly before writing code.
4. Implement the solution incrementally.
5. Provide a clear summary of changes made and instructions for verification.
6. Do not read the Readme.md.
7. Do not commit or push changes before the user has tested them in the browser. After implementing
   and checking a change (tests, build), keep the dev server (`ng serve --host 0.0.0.0 --port 4200`)
   running, leave the changes uncommitted, and ask the user to test them. Commit, push, and update
   the pull request only after the user confirms.
8. Before pushing, rebase onto `origin/webapp` (`git fetch origin webapp && git rebase origin/webapp`).
9. Reply to the user in German. All labels within the UI stay in their original English language
   and are not translated.
10. `npm test` (Vitest) must pass and `npx ng build` must succeed after every change.

## Project

The `webapp` branch contains an Angular web app under `webapp/` that recreates the CANopen editor
(EDSEditorGUI with the older WinForms interface) from `main` in the browser. It reads and writes
the XDD format exclusively (XDD 1.0 and 1.1 are read, XDD 1.1 is written) and covers device
information, the object dictionary, and the TX/RX PDO mapping of several open devices.

## Specification

The structure, the layout, and the function of the web app are specified in
[`GUIDANCE.md`](GUIDANCE.md). It is the binding reference for every change; read the sections
concerned before implementing. The layout templates of the tabs are in `images/`
(`Template_Tab_Device_Info.png`, `Template_Tab_Object_Dictionary.png`,
`Template_Tab_Object_Dictionary_Clone_Object.png`, `Template_Tab_TX_PDO_Mapping.png`,
`Template_Tab_RX_PDO_Mapping.png`); the intentional deviations from them are listed in
`GUIDANCE.md`.

### Documentation rules

- If two rules contradict each other, the latest rule applies. Update `GUIDANCE.md` so that it
  always describes the latest state, and add the decision to its decision history (section 19).
- Document every new or changed feature, layout, or behavior in `GUIDANCE.md`, not in this file.
- Change this file only for working rules. It must not contradict `GUIDANCE.md`.
