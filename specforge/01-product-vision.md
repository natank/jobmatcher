# Product Vision — Governed SDLC Automation Tool

> **Working title:** `SpecForge`
> _A spec-driven development tool that delivers a governed, reviewable, production-ready GitHub repository — not just working code._

---

## 1. The Problem We're Solving

Every current AI dev tool — Kiro, GitHub Copilot, Cursor, Spec Kit — solves the same problem: **write code faster**. They take a requirement and produce an implementation.

That framing is wrong for enterprise teams.

Enterprise teams don't have a "write code faster" problem. They have:

- A **governance problem**: who approved this change, against what requirement, and what was verified?
- A **maintainability problem**: six months later, why was this built this way?
- A **review problem**: diffs that span 40 files across unrelated concerns can't be meaningfully reviewed.
- An **AI trust problem**: if an AI wrote this, how do I know it didn't hallucinate a security boundary?

Existing tools produce code. Enterprises need **governed repositories**.

---

## 2. The Insight

The JobMatcher project — built to automate job search workflows — accidentally designed a development methodology that answers the enterprise problem:

1. **Specs are runtime contracts.** A spec isn't just a planning document; it becomes the Claude system prompt that governs AI behavior in production. The spec doesn't get discarded after the feature ships. It governs what the AI does on every API call.

2. **Implementation plans encode dependency reasoning.** Before a line of code is written, the implementation plan maps the full dependency DAG, groups work into PRs with explicit merge gates, and includes the code structure of each file. The plan is an engineering artifact, not a to-do list.

3. **PRs are the unit of deliverable.** The output isn't a folder of generated code. It's a sequence of dependency-ordered pull requests — each scoped to a reviewable concern, each with pre-specified CI gates, each documented with a PR description that traces back to the spec.

4. **AI is bounded, not trusted blindly.** Deterministic code handles what is formulaic. AI handles only what requires judgment. Zod schemas validate every AI output before it reaches the database. The boundary between "AI decided this" and "code computed this" is explicit and auditable.

The tool we're building takes this methodology and automates it.

---

## 3. What the Tool Does

**Input:** A product requirement or feature description in natural language.

**Output:** A GitHub repository structured as a sequence of dependency-ordered, merge-gate-verified pull requests — ready for engineering team review, CI integration, and production deployment.

The pipeline has four stages:

```
1. SPECIFY     Natural language → versioned spec (goal, inputs, output contract,
               processing flow, edge cases, Zod schema)

2. PLAN        Spec → implementation plan (dependency DAG, PR groupings,
               file-level structure, merge gates per PR, code patterns)

3. EXECUTE     Plan → code, tests, prompts — implemented PR by PR,
               in dependency order, with merge gates enforced

4. GOVERN      Each PR linked to its spec section; prompt files versioned
               alongside code; AI outputs validated by Zod contracts
```

Each stage produces a durable, versioned artifact. Nothing is discarded.

---

## 4. What Makes This Different

### vs. AWS Kiro

Kiro generates `requirements.md` + `design.md` + `tasks.md` from a prompt and executes tasks autonomously inside its IDE. The output is working code. The gap:

- Kiro doesn't think in PRs. Tasks and PRs are different units — a PR requires dependency reasoning, scoping for review, and a gate definition. Kiro has none of this.
- Kiro specs are consumed once, during development. SpecForge specs govern production AI behavior at runtime — they become the system prompts loaded by API routes.
- Kiro has no concept of the deterministic/AI boundary. Every task is AI-executed. SpecForge enforces that deterministic logic stays deterministic, and AI is used only where it's actually needed.
- Kiro's output lives in an IDE session. SpecForge's output is a GitHub repository structured for long-term maintenance.

### vs. GitHub Spec Kit

Spec Kit is a process framework and CLI. It scaffolds templates and slash-commands that work with 30+ agents. The gap:

- Spec Kit is agent-agnostic by design, which means it can't make structural decisions — PR grouping, dependency ordering, merge gates, and code architecture are left entirely to the developer.
- Spec Kit specs are planning artifacts. They don't govern runtime behavior.
- Spec Kit has no implementation plan layer. It goes directly from spec to tasks, skipping the dependency reasoning that makes a codebase maintainable.
- Spec Kit produces files. SpecForge produces a repository.

### The core differentiation in one sentence

> Kiro and Spec Kit help developers build features faster. SpecForge helps engineering organizations ship governed, reviewable, maintainable software — the kind that passes enterprise security review, survives team turnover, and scales without accumulating architectural debt.

---

## 5. Target Customers

**Primary:** Engineering teams at growth-stage and enterprise companies (50–5,000 engineers) who are adopting AI-assisted development but are blocked by governance, review, and maintainability concerns.

**The buyer:** VP Engineering, CTO, or Engineering Manager who has tried Kiro or Copilot and concluded "the code quality isn't reviewable" or "we can't audit what the AI decided."

**The user:** Senior engineers and tech leads who are responsible for code architecture and review — people who currently spend significant time decomposing features into PR-sized, reviewable units and writing implementation plans that junior engineers or AI agents can follow.

**Secondary:** AI-native development shops that want to ship to enterprise clients and need to demonstrate that their AI-generated code meets enterprise governance standards.

---

## 6. The Three Pillars

### Pillar 1: Spec as Contract (not scaffold)

Every feature begins with a spec that defines:

- The input/output contract (Zod schema)
- The processing flow (step by step, including which steps use AI)
- Edge cases and failure modes
- The AI prompt that governs runtime behavior for AI-powered steps

The spec is versioned in the repository. It doesn't get superseded by the code it generates — it remains the authoritative statement of what the feature is supposed to do. When a production AI call misbehaves, the investigation starts at the spec.

### Pillar 2: Implementation Plan as Engineering Artifact

Every feature gets an implementation plan that a senior engineer would be proud to have written:

- Full dependency DAG across files and modules
- PR groupings with explicit rationale ("this PR contains no routes because it's a dependency of all subsequent PRs")
- File-level structure with type signatures and representative patterns
- Merge gate per PR (typecheck, unit tests, integration tests, AI contract tests)
- Definition of Done checklist

The implementation plan is generated by SpecForge but reviewed and approved by a human before execution begins. This is the checkpoint where engineering judgment enters the loop.

### Pillar 3: PR-Structured Repository as Deliverable

The output of SpecForge isn't a codebase — it's a pull request sequence. Each PR:

- Opens against the correct base branch (respecting dependency order)
- Contains only the code relevant to its scope (no cross-cutting changes)
- Has a PR description that references the spec section it implements
- Has pre-specified CI gates that must pass before merge
- Is sized for meaningful code review (not 40-file diffs)

The resulting git history is a navigable audit trail: any engineer can trace from a line of code backward through the PR, the merge gate evidence, the implementation plan, and the spec.

---

## 7. The Methodology SpecForge Encodes

The methodology is not invented for this product — it is extracted and automated from the proven pattern demonstrated in JobMatcher. The key principles:

**Deterministic + AI hybrid by default.** When SpecForge generates implementation code, it separates formulaic logic (pure functions, data transformations, schema validation) from judgment calls (content generation, classification, quality assessment). AI is used for the latter; deterministic code handles the former. The split is documented in the spec and enforced in code structure.

**Zod-first AI outputs.** Every AI call in the generated codebase validates its output against a Zod schema before persisting or returning data. The schema is derived from the spec's output contract. Validation failures trigger a single retry; second failures surface a structured error. There is no path from AI output to database that bypasses schema validation.

**Prompt versioning alongside code.** Every AI-powered feature generates a prompt file in `prompts/<feature>.md`. This file is loaded at runtime — it is not embedded in source code. Changing AI behavior means changing a versioned, reviewable file, not hunting through inline strings. Prompt files are part of the PR diff and subject to the same review and merge gates as code.

**RLS and auth gates enforced structurally.** Every generated route includes `getUser()` before any database write. Every generated table includes a `user_id` column and RLS policies. These are not optional — SpecForge will not generate a route without them.

---

## 8. MVP Scope

The first version of SpecForge demonstrates the full pipeline on a single feature end-to-end:

| Stage       | MVP Capability                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Specify** | Given a natural language feature description, generate a spec in the established format (goal, inputs, output contract, processing flow, edge cases, Zod schema) |
| **Plan**    | Given a spec and a target tech stack, generate an implementation plan (dependency DAG, PR groupings, merge gates, file-level structure)                          |
| **Execute** | Given an implementation plan, execute PR by PR in dependency order — opening actual GitHub PRs with code, tests, and PR description                              |
| **Govern**  | Ensure every PR links to its spec section; every AI-powered route has a prompt file; every AI output has Zod validation                                          |

**Out of scope for MVP:**

- Multi-repo support
- Team collaboration / multi-reviewer workflows
- Support for tech stacks other than Next.js + TypeScript + Supabase (the JobMatcher stack)
- Spec update propagation (what happens when a spec changes after PRs are merged)
- Enterprise SSO / audit log

---

## 9. Why Now

Three conditions converge in 2026 that make this viable:

1. **AI coding agents are capable enough.** Claude Sonnet can write production-quality TypeScript, generate tests, and follow a detailed implementation plan. Six months ago this required more human intervention to be reliable.

2. **The governance gap is felt.** Kiro and Copilot have been widely adopted. Engineering leaders have now seen enough AI-generated PRs to know the problem: the code works but it's not reviewable, not traceable, and not maintainable at scale. The market now understands the problem SpecForge solves.

3. **The methodology is proven.** JobMatcher is a working demonstration of the pattern. Every PR in that repo — the types, the API routes, the AI features, the tests — was produced by following this methodology. The output quality is enterprise-grade. What remains is to automate the methodology itself.

---

## 10. Success Criteria for MVP

- A senior engineer at a company that has never seen SpecForge can give it a feature description, review the generated spec and implementation plan, approve them with minimal edits, and receive a sequence of GitHub PRs they are comfortable merging into a production codebase.
- The generated repo passes: `pnpm typecheck`, `pnpm lint`, `pnpm test` (>80% coverage on generated code), and a security review that finds no auth bypasses, no secrets in client bundle, and no missing RLS policies.
- The git history of the generated repo is navigable: any line of code traces back through PR → merge gate evidence → implementation plan → spec.

---

## 11. Open Questions for Next Phase

1. **Spec generation quality.** How much human review/editing does the generated spec require before it's trustworthy enough to drive an implementation plan? This determines the human-in-the-loop design.
   A: Human should have the option to review and edit every doc generated by the system. A development gate should be required before moving to the next doc. (Ie, vision doc approved, then requirements spec generated, the requirements spec approved then technical design optionally generated, finally implementation plan generated and approved). We are talking about a structured workflow with clear gates, with AI assisted review and editing.
2. **Tech stack generalization.** The methodology is currently proven on one stack (Next.js + TypeScript + Supabase + Claude). How much of the implementation plan generation is stack-specific? What does it take to add a second stack (e.g., FastAPI + Python + PostgreSQL)?
   A: Non is stack specific. This is a stack agnostic methodology, just like SDLC itself, just like Agile methodology.
3. **Spec change propagation.** When a spec changes after PRs are merged, what is the correct behavior? Re-open the affected PRs? Generate a diff PR? This is the hardest product problem and is deferred to v1.1.
   Good question, when spec changes after approval it should be through an engineering change proposal process, and after the change resolution is defined and approved, a change request should be generated and executed. finally the generated documentation and code should be reviewed and merged, like a noraml feature.
4. **Merge gate enforcement.** Should SpecForge block PR merges via GitHub required status checks, or only recommend gates in the PR description? The former requires a GitHub App; the latter is simpler but advisory only.
   A: The tool should be able to communicate with github and enforce compliance to the implementation plan order of PR execution.
5. **Pricing model.** Per-feature (pay per spec executed), per-seat (enterprise license), or per-PR-opened? Enterprise buyers will want per-seat; individual developers will want per-feature.
   A: Maybe I don't know about that yet. I am still in the early stages of the product.
