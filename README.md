<p align="center">
  <img src="https://github.com/user-attachments/assets/6c2ecbdb-7eb3-4779-b3ee-c8388ba6b33b" width="100%" alt="Vibe: describe an app in plain language and an autonomous agent builds it. The run panel walks through one generation - a memoized step creates an E2B sandbox, the agent writes and reads files and runs terminal commands, and the result is saved as a fragment with a live preview URL.">
</p>

Describe an application in plain language, and an autonomous coding agent writes it inside an isolated cloud sandbox, runs it, and returns a live preview you can keep iterating on.

Vibe implements the "chat-to-app" product pattern popularized by Lovable - prompt in, working Next.js app out - as a full-stack TypeScript codebase covering agent orchestration, sandboxed code execution, persistent billing, and a split chat/preview/code UI.

**Before you start:** PostgreSQL, a Clerk application (with a `pro` plan for billing), a Gemini API key, an E2B account, and the Inngest dev server. All five are covered in [Getting started](#getting-started).

## Why this exists

Building software with an LLM is not just a prompt problem. The hard parts are:

- **Executing model output safely.** Generated code must run somewhere isolated, with a filesystem, a package manager, and a dev server.
- **Running long, multi-step jobs reliably.** A generation can take minutes and involve dozens of model turns and tool calls; a request/response cycle is the wrong shape for it.
- **Giving the model real feedback.** The agent needs to read files, install packages, and run commands - not hallucinate an entire app from a single completion.
- **Making the result inspectable.** Users need to see the running app and the generated source, and be able to ask for changes.

Vibe is an end-to-end implementation of those four concerns in one repository, which makes it a useful reference for how agentic developer tools are actually wired together.

## Features

- **Prompt-to-app generation** - a natural-language prompt is handed to a tool-using coding agent that produces a complete Next.js application.
- **Isolated execution sandbox** - every project runs in an E2B sandbox created from a prebuilt template with Next.js, Tailwind, and the full shadcn/ui component set already installed.
- **Live preview** - the sandbox's dev server is exposed over HTTPS and embedded in the project view as an iframe, so the generated app is interactive immediately.
- **Code explorer** - a side-by-side file tree and syntax-highlighted (Prism) viewer shows exactly what the agent wrote.
- **Multi-turn iteration** - follow-up prompts are sent to the same agent with the last five messages of conversation history as context, so requests like "make the header sticky" refine the existing app instead of starting over.
- **Credit-based usage limits** - 5 free generations per 30 days, 100 for Pro subscribers, enforced atomically in Postgres and surfaced as a live counter in the chat pane.
- **Clerk authentication and billing** - hosted sign-in/sign-up, middleware route protection, and a hosted pricing table.
- **Starter templates** - eight one-click prompt presets (Netflix clone, admin dashboard, kanban board, and others) on the landing page.
- **Async, durable generation** - Inngest drives the workflow with step-level memoization, so retries and long-running sandbox operations don't lose progress.

## How it works

Four problems shape this product category, and the whole repository is organized around them:

- **Executing model output safely.** Generated code needs a filesystem, a package manager, and a dev server, somewhere isolated from everything else.
- **Running long, multi-step jobs reliably.** A generation spans dozens of model turns and tool calls, so a request/response cycle is the wrong shape for it.
- **Giving the model real feedback.** The agent reads files, installs packages, and runs commands instead of hallucinating an entire app from a single completion.
- **Making the result inspectable.** Users need to see the running app and the generated source, and be able to ask for changes.

Those four concerns produce three runtimes and one durable record. Vibe is an end-to-end implementation of them in one repository, which makes it a useful reference for how agentic developer tools are actually wired together:

<p align="center">
  <img src="https://github.com/user-attachments/assets/75ad1ebd-d91d-4f9b-9384-5d2988907b06" width="100%" alt="Where the work happens: the Next.js app server handles the synchronous tRPC request, consumes a credit and emits an event; an Inngest function runs the agent in memoized steps; an E2B sandbox gives the agent a terminal and a filesystem. The browser polls every five seconds and renders the stored fragment as a live preview iframe and a code tree.">
</p>

### Request lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant W as Next.js app
    participant DB as PostgreSQL
    participant I as Inngest
    participant A as Coding agent (Gemini)
    participant S as E2B sandbox

    U->>W: Prompt
    W->>DB: Consume credit, store user Message
    W->>I: Emit code-agent/run event
    I->>S: Create sandbox from vibe-coder-template
    loop Up to 15 iterations
        A->>S: terminal / createOrUpdateFiles / readFiles
        S-->>A: stdout, file contents
    end
    A-->>I: Final <task_summary>
    I->>A: Generate fragment title + user-facing reply
    I->>DB: Store assistant Message + Fragment (files, sandbox URL)
    W-->>U: UI polls every 5s, renders preview and code
```

1. **Prompt submission.** The home page or project chat pane calls a tRPC mutation. The server verifies project ownership, consumes one credit, stores the user's message, and emits a `code-agent/run` Inngest event - then returns immediately. Generation is not part of the HTTP request.
2. **Sandbox provisioning.** The Inngest function creates an E2B sandbox from the `vibe-coder-template` and extends its timeout to 30 minutes. The sandbox ID is captured inside a memoized step, so a retry reconnects to the same sandbox instead of creating a new one.
3. **Agent run.** A `@inngest/agent-kit` network runs a single agent equipped with three tools - `terminal`, `createOrUpdateFiles`, and `readFiles` - all executing against the sandbox. The network iterates up to 15 times, seeded with the previous five messages from the project for continuity.
4. **Completion detection.** The agent's system prompt (`src/constants/prompt.ts`) requires it to end its work with a `<task_summary>` block. A lifecycle hook watches model responses, and when the summary appears it's stored in network state. The network router then stops routing to the code agent.
5. **Post-processing.** Two small, fast agents derive a 3-word fragment title and a short user-facing completion message from the summary.
6. **Persistence.** A `Fragment` row is created containing the full file map, the fragment title, and the sandbox's public URL. Errors (no summary, or no files written) are stored as `ERROR` messages instead.
7. **Delivery.** The client polls messages every 5 seconds, auto-selects the newest fragment, and renders it in the preview iframe or code explorer.

### The agent

The code agent is instructed to behave as a senior engineer working inside a sandboxed Next.js 15.3.3 environment, with strict constraints encoded in the prompt rather than enforced by the runtime:

- Files are written only through `createOrUpdateFiles`, with paths relative to the sandbox home directory.
- Packages are installed via the terminal - never by editing `package.json` directly.
- Styling must use Tailwind and shadcn/ui components only; creating `.css`, `.scss`, or `.sass` files is disallowed.
- The dev server is already running and hot-reloads on file writes, so `dev`/`build`/`start` commands must never be run.
- Output must be complete features, not stubs or placeholders.

Model configuration lives in `src/inngest/functions.ts`: `gemini-2.5-flash` for the coding agent, and `gemini-2.0-flash` for the title and response generators.

### The sandbox template

`sandbox-templates/nextjs/` defines the E2B image the agent works in:

- `node:21-slim` base with `curl` installed.
- A scaffolded Next.js 15.3.3 app plus the full shadcn/ui component library, initialized with `shadcn init` and `shadcn add --all`.
- `compile_page.sh` as the start command - it launches `next dev --turbopack` and polls `localhost:3000` until the first page compiles, so a sandbox is only considered ready once the app actually serves traffic.
- `e2b.toml` binds the template name (`vibe-coder-template`) and start command. The template name is referenced literally in `src/inngest/functions.ts`, so building it under a different name requires updating that reference.

### Credits and plans

`src/lib/usage.ts` uses `rate-limiter-flexible` backed by the Prisma `Usage` table, giving atomic consumption across server instances:

| Setting | Value |
| --- | --- |
| Free plan credits | 5 per 30 days |
| Pro plan credits | 100 per 30 days |
| Cost per generation | 1 |
| Pro plan slug | `pro` (checked via `has({ plan: "pro" })`) |

The `pro` plan slug is resolved from Clerk, so it must exist in the Clerk dashboard for the upgrade flow and Pro credit ceiling to work. A request with no remaining credits returns `TOO_MANY_REQUESTS`, which the client turns into a redirect to the pricing page.

### Data model

Four Prisma models (`prisma/schema.prisma`):

| Model | Purpose |
| --- | --- |
| `Project` | A user-owned workspace, named with a generated word slug. |
| `Message` | One turn in a project's conversation, with `role` (`USER`/`ASSISTANT`) and `type` (`RESULT`/`ERROR`). |
| `Fragment` | A snapshot of generated output: the sandbox URL, a title, and the full `files` JSON map. One per message, cascade-deleted with it. |
| `Usage` | The rate-limiter store keyed by Clerk user ID. |

## Technology stack

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | Next.js 15 (App Router), React 19 | Server components, route handlers, server-side data prefetching. |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | End-to-end type safety. |
| API | tRPC v11 + TanStack Query v5 | Type-safe procedures, client caching, server prefetch with `HydrationBoundary`; `superjson` preserves rich types over the wire. |
| Database | PostgreSQL + Prisma 6 | Projects, messages, fragments, usage. Client generated into `src/generated/prisma`. |
| Auth & billing | Clerk | Middleware route protection, user identity, hosted pricing table, plan checks. |
| Workflow | Inngest + `@inngest/agent-kit` | Durable step execution, agent network, tool-calling loop. |
| Models | Google Gemini (`@inngest/agent-kit` provider) | Code generation and text summarization. |
| Sandbox | E2B Code Interpreter | Isolated VM per project with filesystem, terminal, and exposed ports. |
| Validation | Zod + `@t3-oss/env-nextjs` | Runtime input validation on every procedure and fail-fast env validation. |
| UI | Tailwind CSS v4, shadcn/ui, Radix primitives, lucide-react, sonner | Component system, theming via CSS variables, toasts. |
| Tooling | Biome, Husky, lint-staged, commitlint | Formatting, linting, pre-commit checks, conventional commits. |

**Why these choices:** Inngest is used over a plain background job because each tool call is a memoized step - a failed sandbox command or model call retries without re-running the work that already succeeded, and sandbox state is reconnected rather than rebuilt. tRPC is paired with TanStack Query so the same procedure can be prefetched on the server and re-fetched on the client (the project page uses this for the message list and project record). E2B provides the sandbox as a managed service, which is what makes it possible to expose each project's dev server on a public HTTPS URL without any networking code in this repo.

## Getting started

### Prerequisites

- Node.js 20+ and [Bun](https://bun.sh) (the lockfile is `bun.lock`; npm/pnpm work too)
- A PostgreSQL database
- A [Clerk](https://clerk.com) application, with a `pro` plan configured for billing
- A [Google AI Studio](https://aistudio.google.com) API key for Gemini
- An [E2B](https://e2b.dev) account and API key
- [Inngest Dev Server](https://www.inngest.com/docs/local-development) for local workflow execution

### 1. Install dependencies

```bash
git clone <repository-url>
cd lovable
bun install
```

`postinstall` runs `prisma generate`, which writes the client to `src/generated/prisma` (gitignored).

### 2. Configure environment variables

Create a `.env` file in the project root:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/vibe"

GEMINI_API_KEY="your-google-ai-api-key"
E2B_API_KEY="your-e2b-api-key"

NEXT_PUBLIC_APP_URL="http://localhost:3000"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Validated in `src/lib/env/server.ts`. |
| `GEMINI_API_KEY` | Yes | Google Gemini API key used by the agent models. Validated in `src/lib/env/server.ts`. |
| `E2B_API_KEY` | Yes | E2B API key for creating sandboxes and building the template. Validated in `src/lib/env/server.ts`. |
| `NEXT_PUBLIC_APP_URL` | No | Base URL used to build the tRPC endpoint. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key, read by the Clerk SDK. |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key, read by the Clerk SDK on the server. |

The first three are validated at startup by `@t3-oss/env-nextjs`, so a missing value fails fast with a clear error. The Clerk keys are consumed by the Clerk SDK rather than the env schema.

The Inngest SDK reads `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` when deployed against Inngest Cloud; neither is needed with the local dev server.

### 3. Apply database migrations

```bash
bun run db:migrate
```

### 4. Build the E2B sandbox template

The agent works inside a template image, not a bare sandbox. Build it once from the template directory:

```bash
cd sandbox-templates/nextjs
npx e2b template build
```

This uses `e2b.toml` (template name `vibe-coder-template`) and `e2b.Dockerfile`. Building takes a few minutes because the image installs the full shadcn/ui component set. If you rename the template, update the `Sandbox.create(...)` call in `src/inngest/functions.ts` to match.

### 5. Run the app and the workflow engine

Two processes are needed - the Next.js app and the Inngest Dev Server, which dispatches the `code-agent/run` events the app emits.

```bash
# Terminal 1 - Next.js (Turbopack)
bun run dev

# Terminal 2 - Inngest Dev Server
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open [http://localhost:3000](http://localhost:3000). The Inngest dashboard, where individual agent runs can be inspected step by step, is at [http://localhost:8288](http://localhost:8288).

## Usage

1. **Sign up** at `/sign-up`, then return to the dashboard.
2. **Submit a prompt** on the home page - either type one or click a template chip such as "🎬 Build a Netflix clone". `Ctrl`/`Cmd`+`Enter` submits.
3. **Watch it build.** You're redirected to `/project/<id>`. The chat pane shows messages while polling every 5 seconds, and the loading shimmer cycles through status messages until the assistant replies.
4. **Explore the result.** The right pane opens on the **Demo** tab, an iframe of the sandbox's dev server with refresh, copy-URL, and open-in-new-tab controls. Switch to **Code** to browse the generated files in a tree with syntax highlighting and copy-to-clipboard.
5. **Iterate.** Send follow-up prompts in the same chat pane; the agent receives the last five messages as context and continues editing the same sandbox. Older fragments remain selectable from their cards in the conversation.
6. **Track credits.** The bar above the chat input shows remaining credits and the time until reset. When free credits are exhausted, requests redirect to `/pricing`, where the Clerk pricing table handles the upgrade.

## Configuration

Values that control runtime behavior and are set in code, not the environment:

| Setting | Location | Value |
| --- | --- | --- |
| Sandbox lifetime | `src/inngest/index.ts` | 30 minutes, refreshed on every reconnect |
| Agent iteration limit | `src/inngest/functions.ts` | 15 network iterations |
| Conversation history depth | `src/inngest/functions.ts` | Last 5 messages per project |
| Agent models | `src/inngest/functions.ts` | `gemini-2.5-flash` (code), `gemini-2.0-flash` (title, response) |
| Credit rules | `src/lib/usage.ts` | 5 free / 100 Pro points per 30 days; 1 per generation |
| Client message polling | `src/modules/projects/ui/components/messages-container.tsx` | 5 seconds |
| Sandbox template | `src/inngest/functions.ts` | `vibe-coder-template` |
| Agent system prompts | `src/constants/prompt.ts` | Sandbox rules, title prompt, response prompt |
| Prompt presets | `src/constants/project-templates.ts` | 8 starter prompts |

## Project structure

```
src/
├── app/
│   ├── (home)/                 # Public shell: landing, pricing, sign-in/up (navbar layout)
│   ├── api/
│   │   ├── inngest/route.ts    # Inngest serve endpoint (workflow entry point)
│   │   └── trpc/[trpc]/route.ts# tRPC fetch adapter
│   └── project/[projectId]/    # Project workspace (protected, prefetches then hydrates)
├── components/
│   ├── global/                 # CodeView (Prism), TreeView, UserControl
│   └── ui/                     # shadcn/ui components + FileExplorer
├── constants/                  # Agent prompts and starter templates
├── hooks/                      # Theme and scroll helpers
├── inngest/
│   ├── client.ts               # Inngest client
│   ├── functions.ts            # code-agent workflow: sandbox, tools, agent network
│   └── utils.ts                # Sandbox connection and agent output parsing
├── lib/                        # env validation, Prisma client, credit tracking, tree utils
├── modules/                    # Feature slices: home, projects, messages, usage
│   ├── <feature>/server/       # tRPC procedures
│   └── <feature>/ui/           # Components, views
├── trpc/                       # Client/server providers, context, router root
└── middleware.ts               # Clerk route protection
prisma/
├── schema.prisma               # Project, Message, Fragment, Usage
└── migrations/                 # Migration history
sandbox-templates/nextjs/       # E2B template: Dockerfile, start script, e2b.toml
```

The `modules/` convention keeps each feature's server procedures alongside its UI components, and every router is registered in `src/trpc/routers/_app.ts` as the single source of truth for the API surface:

- `projects`: `getOne`, `getMany`, `create`
- `messages`: `getMany`, `create`
- `usage`: `status`

All procedures are `protectedProcedure` - they reject unauthenticated calls and scope queries to the caller's Clerk user ID.

## Development

| Command | Description |
| --- | --- |
| `bun run dev` | Start Next.js with Turbopack. |
| `bun run build` | Production build. |
| `bun run start` | Serve the production build. |
| `bun run lint` | Biome lint with fixes. |
| `bun run format` | Biome check with fixes (formatting, imports, lint). |
| `bun run db:migrate` | Create and apply a Prisma migration in development. |

**Code style.** Biome is the single formatter and linter (2-space indentation, double quotes, no semicolons, 80-column width). `noExplicitAny`, `noUnusedVariables`, and `useImportType` are errors. `.vscode/settings.json` configures format-on-save for VS Code users.

**Commits.** A Husky pre-commit hook runs `lint-staged` (Biome on staged files), and commitlint enforces [Conventional Commits](https://www.conventionalcommits.org) with a fixed type list (`feat`, `fix`, `chore`, `refactor`, `docs`, `test`, etc.) and a 100-character header limit.

**Tests.** There is no test suite in the repository yet. Adding one is the most valuable next step - the credit logic, tree-building utility (`convertFilesToTreeItems`), and agent output parsing (`parseAgentOutput`) are all pure functions that are straightforward to cover.

## Limitations and current status

- **No automated tests.** The codebase relies on type checking and linting for correctness.
- **Single-agent design.** A router is configured for the network, but only one agent participates; multi-agent specialization (e.g. separate planner and implementer) is not implemented.
- **Prompt-enforced sandbox rules.** The "never run the dev server" and "no CSS files" constraints live in the system prompt rather than being blocked by the sandbox, so a non-compliant model response could violate them.
- **No sandbox teardown.** Sandboxes expire via their 30-minute timeout; there is no explicit cleanup job.
- **No CI or deployment configuration** is checked in. Running this in production requires Inngest Cloud (or self-hosted), a managed Postgres instance, production Clerk keys, and a rebuilt E2B template - see "Getting started" for the equivalent local setup.
- **UI metadata is still scaffold defaults** in `src/app/layout.tsx` (page title and description from `create-next-app`).
- **Polling, not streaming.** Progress is surfaced by refetching messages every 5 seconds rather than pushing events to the client.

## License

No license file is included in this repository. All rights are reserved by the author by default - add a `LICENSE` file before using this code in a way that requires explicit permission.
