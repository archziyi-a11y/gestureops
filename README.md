# GestureOps

A spatial operations workbench for asset composition and AI-assisted maintenance.

Drag project and asset cards to inspect operational facts or assemble maintenance context. Routine operations live in dedicated work surfaces; complex work is handed to an agent with the relevant evidence, scope, and maintenance instructions.

## Start Here

- [Workface and card-context experience archive](docs/EXPERIENCE-INDEX.md) — full methods, retrospectives, and independent handoff experiments (104 original documents).
- [Workbench documentation](workbench-prototype-v3/README.md)
- [Agent handoff entry](workbench-prototype-v3/docs/AGENT-START.md)
- [User guide](workbench-prototype-v3/docs/USER-GUIDE.md)
- [Operations guide](workbench-prototype-v3/docs/OPERATIONS.md)
- [FAQ](workbench-prototype-v3/docs/FAQ.md)

## Repository Scope

This initial repository contains the tracked workbench source, tests, icons, and maintenance documentation from `smart-customer-service/workbench-prototype-v3`. It starts a new Git history rather than publishing the entire business monorepo history.

Runtime state, customer materials, knowledge source originals, credentials, recovery archives, installed dependencies, and unrelated business projects are intentionally excluded.

This is **not yet a standalone deployment bundle**. Existing adapters refer to sibling business modules, Python environments, local services, and configured remote APIs from the original workspace. Those dependencies have not been replaced with simulations. A fresh clone does not imply that the sales assistant, Prism, Feishu, or automation integrations are connected. Some historical documentation retains original local paths as operational context.

## Local Setup

Node.js 18 or newer is required for the workbench. Install dependencies inside `workbench-prototype-v3` with `npm ci`. The local server is started there with `npm start`; configure `PORT` and an isolated `STATE_DIR` before testing. Do not point a trial installation at existing production state.

Business adapters require the corresponding external modules and configuration described in the operations and maintenance documents. The initial export preserves their current integration contracts; extracting those dependencies is separate work.
