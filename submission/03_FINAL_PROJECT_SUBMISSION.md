# LEGALX — From Legal Language to Executable Agreements

Team LEXORA · HI025038 · HackIndia 2026 · PS-03 Smart Contract Creation

## 50 words

LEGALX helps lawyers and developers check whether an execution specification preserves an agreement. It turns terms into structured fields, compares them deterministically, and records findings against a version. Reviewers can inspect the evidence before approving that version. Execution remains a separate, permissioned action inside the application. Server checks protect revisions.

## 100 words

LEGALX helps lawyers and developers check whether an execution specification preserves an agreement. It turns terms into structured fields, compares them deterministically, and records findings against a version. Reviewers can inspect the evidence before approving that version. Execution remains a separate, permissioned action inside the application. Server checks protect revisions. Consider a contract with a mediation clause. If an execution specification substitutes arbitration, the amount tells reviewers nothing about that change. LEGALX identifies the field and records it. Its Trust Passport connects the finding to the version and fingerprints of the inputs. A reviewer returns to it after each revision.

## 250 words

LEGALX helps lawyers and developers check whether an execution specification preserves an agreement. It turns terms into structured fields, compares them deterministically, and records findings against a version. Reviewers can inspect the evidence before approving that version. Execution remains a separate, permissioned action inside the application. Server checks protect revisions. Consider a contract with a mediation clause. If an execution specification substitutes arbitration, the amount tells reviewers nothing about that change. LEGALX identifies the field and records it. Its Trust Passport connects the finding to the version and fingerprints of the inputs. A reviewer returns to it after each revision.

Our demonstration starts with a question: what happens when the contract and the implementation look reasonable, but describe different obligations? The homepage illustrates the risk with three payments of ten thousand rupees and an encoded total of thirty five thousand. The live demonstration uses a separate agreement and changes a legal term that the verification endpoint accepts.

The frontend combines React, TypeScript and Three.js. FastAPI handles sessions, workspace boundaries, agreement versions, parity runs and approval checks. PostgreSQL provides managed storage in the deployment design. A local deterministic workflow lets judges explore the interface independently of remote model availability.

For a legal operations team, the use is reviewing a change before handoff to an engineer. For a freelancer, it is seeing which agreed condition changed between revisions. Future work includes broader clause coverage and evaluation of assisted extraction against reviewed examples. The prototype does not settle funds or determine legal enforceability.

## Full technical description

A signed clause and an implementation parameter can each pass review in isolation. A discrepancy emerges only when somebody compares the two. That comparison takes time and becomes harder to repeat after an amendment. A wrong amount can affect payment, while a changed dispute procedure can affect what the parties expect to happen next.

LEXORA built LEGALX to make that handoff inspectable. The authenticated workflow creates an agreement and versions its text. The server derives a canonical intermediate representation (Contract IR). The comparison engine produces field findings with explicit status. The Trust Passport identifies the run, version, hashes and evidence. Approval binds a permitted human decision to an exact version hash. A later attempt at execution must satisfy independent checks.

The live verification API accepts two legal clarifications. The larger ₹30,000 versus ₹35,000 story on the homepage illustrates the problem. A separate ₹50,000 agreement exercises the actual comparison endpoint. The interface offers a local deterministic extraction demonstration. A Gemini adapter exists with mocked tests. Live hosted inference has not been demonstrated here. A Solidity generator produces candidate source. The execution workflow records an off-chain application transition. Wallet signing, deployed bytecode and cash settlement lie outside the delivered path.

Vite serves React and TypeScript, with Three.js used for the cinematic experience. FastAPI handles the authenticated HTTP boundary. Vercel Services routes requests, and the managed deployment design uses Neon PostgreSQL. Organization-scoped access, CSRF checks, hash-bound approvals and idempotency protect distinct steps. The team claims neither external security certification nor a legal opinion.

## Innovation pitch

Ask a contract generator what it wrote. Ask LEGALX which term changed, which version it compared, and whose approval is still missing.

## One-line tagline

From Legal Language to Executable Agreements.
