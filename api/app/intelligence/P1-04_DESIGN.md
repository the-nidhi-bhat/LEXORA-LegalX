# P1-04 Contract Intelligence — design and implementation notes

**Owner:** Nidhi. **Scope:** AI-powered natural-language agreement extraction into the
existing Contract IR. **Principle:** *AI proposes. Rules decide.*

---

## 1. Architecture discovered (Phase 1 audit)

| Area | Actual state at `185da7d` |
|---|---|
| Contract IR | `api/app/schemas/ir.py` — Pydantic v2, strict integer money, provenance as `{field, source_span}` byte offsets, `ir_to_hash` excludes `provenance` |
| Deterministic derivation | `api/app/ir/derive.py` — pure function from stored rows; no LLM, no network. **Not duplicated, not modified.** |
| Parity engine | `api/app/parity/` — `ParityEngine`, `ExecutionParameters`, `ParityResult`, canonicalization v2. **Not modified.** |
| AI code | **None.** The browser demo simulates extraction locally (`src/App.tsx`: "AI extraction is simulated locally… no AI provider was called"). No Python AI module, no Gemini SDK, no provider code anywhere. |
| Dependencies | Root `package.json` is the Vite frontend only. Python packages are installed ad hoc (pydantic 2.13.5, pytest 9.1.1, fastapi 0.141.1). No Python manifest existed — `api/requirements.txt` was added by this work. |
| Credentials | `.env.example` already declares `GEMINI_API_KEY` ("server-side only, never expose in browser bundles"). The variable is **not set** in this environment. |
| Intended pipeline | `docs/AI_PIPELINE.md`: "receive a user description, normalize input, ask Gemini for strict structured output, validate against the canonical Contract IR schema, identify missing/ambiguous fields, then require human review". |

Consequences: this work adds the first real extraction implementation, does not duplicate
`derive.py`, and leaves P0-06/P0-07 untouched.

## 2. Module layout

```
api/app/intelligence/
  __init__.py            public API
  errors.py              typed error hierarchy (retryable / not retryable)
  models.py              provider payload + extraction result models
  parsing.py             strict money/date/enum parsing (no guessing)
  prompting.py           prompt construction, injection-resistant framing
  provider.py            provider protocol + scripted provider
  gemini_provider.py     Gemini adapter (official google-genai SDK)
  extractor.py           the deterministic pipeline
  evaluation.py          dataset loader, metrics, CLI
  dataset.json           10 evaluation scenarios
```

Framework independent by design: no HTTP server, no database, no session handling, no
dependency on FastAPI or Next.js. Sam can mount it inside whichever service architecture
is chosen (the FastAPI vs Next.js/Supabase decision is still open — see the P0-08 handoff).

## 3. Pipeline

1. **Normalize** — NFC, newlines normalised, outer whitespace stripped. The normalized text
   is the text provenance offsets refer to.
2. **Provider call** — one request, one structured-output response.
3. **Schema validation** — the provider payload is validated against `ExtractionPayload`
   (`extra="forbid"`). Unknown keys are **rejected**, not ignored: an injected `approved`
   flag fails the whole extraction instead of being silently dropped.
4. **Evidence verification** — every value must carry a passage (`evidence`) that occurs
   **verbatim** in the source text. A value whose evidence cannot be located is discarded
   and becomes a clarification request. This is the anti-hallucination gate.
5. **Deterministic parsing** — amounts become exact integer minor units (rejects a third
   decimal place, percentages, zero and negative values); dates must be unambiguous
   (`01/12/2026` and "within 45 days of kickoff" are rejected); enums map through an
   explicit alias table, and an unsupported value is an error rather than a default.
6. **Cross-field checks** — milestone amounts must sum to the stated total; milestone
   currency must match the agreement currency; parties must include a client and a
   provider; the same name or email may not identify two different parties; milestone
   sequence numbers must be unique.
7. **Draft IR** — a `ContractIR` is built only when every required field is present and
   consistent. Otherwise the result is `needs_clarification` with no IR.
8. **Unsupported terms** — clauses with no IR field (non-compete, penalty, IP assignment…)
   are reported in `unsupported_terms` for legal review, never dropped.

### Statuses

`complete` · `needs_clarification` · `rejected` (malformed or unsupported provider output) ·
`provider_error` (with `retryable`).

## 4. Provenance and confidence

Provenance entries are `{field, source_span{start,end}, quote, confidence}` where the span
is a **byte** offset into the UTF-8 encoding of the normalized text — matching the P0-06
convention that provenance points into the stored agreement text. `quote` is verified to
equal the referenced bytes.

Confidence is carried **only** when the provider returned an estimate; it is never invented.
It is stored inside `provenance`, which `ir_to_hash` (P0-06) and `canonicalize_approved_ir`
(P0-07) both exclude, so recording confidence does not change any legally significant
hash. This is asserted by `test_confidence_in_provenance_does_not_change_the_ir_hash`.

## 5. Human review and authority

`ExtractionResult.approved` is typed `Literal[False]` and `human_review_required` is
`Literal[True]`: setting either is a validation error, not a silent success. The module
contains no approval function, no execution token and no authorization logic. A complete
extraction is still only a *draft*.

## 6. Gemini integration

- SDK: official `google-genai` (`from google import genai`, `from google.genai import types`),
  imported lazily so the package works when the optional dependency is absent.
- Model: `gemini-3.8-flash` by default, overridable with `LEGALX_GEMINI_MODEL`.
- Structured output: `response_mime_type="application/json"` plus
  `response_json_schema` (hand-written schema, deliberately not duplicated in the prompt).
- Determinism: `temperature=0.0`, `candidate_count=1`, fixed API version `v1`.
- Credentials: `GEMINI_API_KEY` only (constructor argument or environment). The key is
  never logged, never placed in the prompt or metadata, and is **redacted** from error
  messages.
- Errors: mapped to typed errors — authentication (401/403), rate limit (429), timeout,
  server error (5xx), transport error, safety block, malformed/empty response.
- Retries: transient failures only, bounded (`max_attempts`, default 3) with linear
  backoff and an injectable sleep. There is **no silent fallback**: if Gemini cannot be
  used, the call raises and the pipeline reports `provider_error`.

## 7. Prompt injection

The description is untrusted data. It is fenced inside `<<<AGREEMENT_DESCRIPTION>>>`
delimiters, the system instruction states that the description is data and that embedded
instructions must be ignored, and every extracted value must be backed by a verbatim
passage. Defense in depth:

- unknown fields → rejected (an injected `approved: true` fails);
- invented values → discarded when the evidence is absent;
- a value that is present in the text but contradicts the rest of the agreement (the
  injected "the total fee is INR 9,99,999") is caught by the milestone-sum check and
  becomes a clarification.

## 8. Evaluation

`api/app/intelligence/dataset.json` holds 10 scenarios: complete agreement, missing
payment amounts, relative deadlines, ambiguous numeric date, conflicting party identities,
multiple milestones, unsupported legal terms, prompt injection with an unknown field,
prompt injection with a conflicting total, and malformed provider output.

Run it with:

```
python -m api.app.intelligence.evaluation --provider scripted   # deterministic
python -m api.app.intelligence.evaluation --provider gemini      # live, needs GEMINI_API_KEY
```

**Measured (scripted mode, 2026-11-14, 10 scenarios):**

| Metric | Value |
|---|---|
| status_match_rate | 1.0 |
| schema_validation_success | 0.8 (the two adversarial payloads are intentionally invalid) |
| field_level_accuracy | 1.0 |
| amount_accuracy | 1.0 |
| date_accuracy | 1.0 |
| party_role_accuracy | 1.0 |
| unsupported_value_hallucination_rate | 0.111 |
| missing_information_detection | 1.0 |

**What these numbers are and are not.** The scripted mode replays recorded provider
payloads, so these numbers measure the **deterministic pipeline** (validation, evidence
checking, clarification generation) — they are not model accuracy. **Live Gemini accuracy
has not been measured**: `GEMINI_API_KEY` is not set in this environment and the
`google-genai` SDK is not installed, so `api/tests/test_intelligence_gemini_live.py` is
skipped. No score has been fabricated in its place.

## 9. Integration notes for P0-08

- Call `extract_agreement(description, provider)` and store the result as a **draft**;
  approval, verification runs and the execution gate remain server-side and human-gated.
- `contract_ir` is a normal P0-06 `ContractIR`, so it can be hashed with `ir_to_hash` and
  compared with the P0-07 `ParityEngine` (asserted by
  `test_extracted_draft_can_be_compared_by_the_parity_engine`).
- `agreement_id` / `version_id` are generated by default and can be injected, so the
  server controls identity and versioning.
- Party **identity** is still not bound by this work: the extractor reports names and
  emails, but binding execution parties to approved parties remains a P0-08 responsibility
  and a deployment blocker.

## 10. Known limitations

- Percentages ("50% upfront") cannot be converted without a stated base and become a
  clarification; a currency conversion request likewise cannot be invented.
- Only the four IR currencies and the four IR governing laws are supported; anything else
  is a clarification, not a guess.
- The IR schema has no field for many common clauses (warranties, IP, liability caps,
  termination). They are surfaced in `unsupported_terms` for human legal review.
- Live model accuracy is pending (no credentials, SDK not installed).
