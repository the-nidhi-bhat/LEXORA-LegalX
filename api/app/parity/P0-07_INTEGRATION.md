# P0-07 Parity Engine — Integration Guide

## Overview

The Parity Engine compares an **approved ContractIR** against **ExecutionParameters** and produces a structured, version-bound `ParityResult`. It does **not** independently approve agreements or grant execution authorization — the caller supplies trusted verification context.

## Public Import Paths

```python
from api.app.parity import (
    ParityEngine,           # Core comparison engine
    ExecutionParameters,    # Strict execution-parameter model
    ParityResult,           # Structured comparison result
    ParityFieldResult,      # Field-level result
    VersionBinding,         # Hash/version binding
    ParityResultMetadata,   # Metadata wrapper
    run_parity_comparison,  # Convenience function
)
```

## Input Models

### ContractIR (P0-06 — existing)

| Field | Type | Notes |
|-------|------|-------|
| agreement_id | str | Trusted identifier |
| version_id | str | Trusted version identifier |
| agreement_type | AgreementType enum | freelance_milestone, etc. |
| currency | Currency enum | INR, USD, etc. |
| total_amount_minor | int | Paise (₹50,000 = 5,000,000) |
| parties | List[Party] | Min 2; CLIENT+PROVIDER required |
| milestones | List[Milestone] | Sum must equal total_amount_minor |
| review_period_days | int | 1–90 inclusive |
| review_period_basis | ReviewPeriodBasis enum | calendar, business |
| dispute_behavior | DisputeBehavior enum | mediate, arbitrate, etc. |
| governing_law | GoverningLaw enum | Optional |

### ExecutionParameters (P0-07 — new)

Same field set as ContractIR with strict Pydantic v2 validation:
- Integer minor units only — **no floats, no booleans**
- Milestone sum must equal `total_amount_minor`
- Milestone sequences must be unique and positive
- CLIENT + PROVIDER required; WITNESS optional
- Rejects unexpected/malformed input

## Required Verification Context

The engine expects the caller to provide:
1. A valid, approved `ContractIR` object
2. A valid `ExecutionParameters` object
3. Trusted `agreement_id` and `version_id` (already embedded in both models)

The engine does **not** verify approval state — that is the caller's responsibility.

## Output Models

### ParityResult

| Field | Type | Description |
|-------|------|-------------|
| schema_version | str | Always "parity_v1" |
| agreement_id | str | From input |
| version_id | str | From input |
| approved_ir_hash | str | SHA-256 of canonicalized IR |
| execution_params_hash | str | SHA-256 of canonicalized exec params |
| canonicalization_version | str | "v1" |
| parity_rules_version | str | "v1" |
| overall_status | Literal | match / advisory / blocked / invalid_input / stale |
| is_blocked | bool | True if any blocking mismatch |
| has_advisory_diffs | bool | True if advisory-only differences |
| field_results | List[ParityFieldResult] | Ordered: blocking → advisory → ok |
| message | str | Human-readable summary |
| recommendation | Literal | proceed / blocked / review |
| verified_at | datetime | Caller-supplied timestamp |

### ParityFieldResult

| Field | Type | Description |
|-------|------|-------------|
| field | str | Dot-path field name |
| status | Literal | blocking / advisory / ok |
| expected | Any | Value from approved IR |
| actual | Any | Value from execution params |
| error | Optional[str] | Populated only for blocking |
| resolution | Optional[str] | Populated only for advisory |

## Blocking/Advisory Semantics

**Blocking** (prevents execution):
- agreement_id mismatch
- version_id mismatch
- currency mismatch
- total_amount_minor mismatch (even 1 paise)
- milestone amount mismatch
- milestone due_date mismatch
- missing required milestone
- unexpected milestone (milestone count differences surface here, per sequence)
- review_period_days mismatch
- review_period_basis mismatch **while the review-period length matches** — the basis
  then changes the computed deadline by itself
- dispute_behavior mismatch
- governing_law mismatch **when both sides declare a law and the values conflict**
- missing CLIENT party
- missing PROVIDER party

**Advisory** (flags for review):
- witness party difference (present in one, absent in other)
- party count difference for client/provider
- party **name** difference — reported only; it is not identity verification
- party **email** difference
- milestone **name** difference
- acceptance_criteria difference
- review_period_basis difference when review_period_days also differs (the deadline
  is already blocked, so the basis adds no further deadline effect)
- governing_law declared on one side only (a gap, not a contradiction)

> **Design note.** `engine_design.md` A.12/A.14 vs B.4/B.5 leave the classification of
> `review_period_basis` and `governing_law` conditional on an "affects the deadline /
> execution obligations" signal that the current models do not carry. The rules above
> implement those conditions using only signals that exist. The overall outcome is never
> more permissive than before: a conflicting governing law now blocks, and the basis is
> only ever advisory when `review_period_days` already blocks. A design decision is still
> needed for a first-class "affects deadline" flag; see the P0-08 handoff.

> **Party identity is not enforced here.** The engine reports name/email differences so
> a swapped counterparty is visible, but it does not bind execution parties to approved
> parties. That requires trusted identity context (P0-08) and **remains a deployment
> blocker** — design section 7.


## Hash/Version Binding

- `approved_ir_hash` and `execution_params_hash` are **never interchangeable**
- Hash equality is **never** a substitute for field comparison
- Result binds to: agreement_id, version_id, both hashes, canonicalization_version, parity_rules_version
- Stale detection: `engine.is_stale(other_version_id='...')` returns True when any bound input changes

## Examples

### Successful Comparison

```python
from api.app.parity import ParityEngine, ExecutionParameters
from api.app.schemas.ir import ContractIR, Party, PartyRole, Milestone

approved = ContractIR(
    agreement_id='ag-001', version_id='ver-001',
    agreement_type='freelance_milestone', currency='INR',
    total_amount_minor=5000000,
    parties=[
        Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
    ],
    milestones=[
        Milestone(seq=1, name='Design', amount_minor=5000000,
                  due_date='2026-12-01', acceptance_criteria='OK'),
    ],
    review_period_days=30, review_period_basis='calendar',
    dispute_behavior='mediate',
)

eps = ExecutionParameters(
    agreement_id='ag-001', version_id='ver-001',
    agreement_type='freelance_milestone', currency='INR',
    total_amount_minor=5000000,
    parties=[
        Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
    ],
    milestones=[
        {'seq': 1, 'name': 'Design', 'amount_minor': 5000000,
         'due_date': '2026-12-01', 'acceptance_criteria': 'OK'},
    ],
    review_period_days=30, review_period_basis='calendar',
    dispute_behavior='mediate',
)

engine = ParityEngine(approved, eps)
result = engine.compare()
# result.overall_status == 'match'
# result.recommendation == 'proceed'
# result.is_blocked == False
```

### Blocked Comparison

```python
eps_bad = ExecutionParameters(
    agreement_id='ag-001', version_id='ver-001',
    agreement_type='freelance_milestone', currency='USD',  # Different currency
    total_amount_minor=5000000,
    parties=[...],  # Same parties
    milestones=[...],  # Same milestones
    review_period_days=30, review_period_basis='calendar',
    dispute_behavior='mediate',
)
result = ParityEngine(approved, eps_bad).compare()
# result.overall_status == 'blocked'
# result.recommendation == 'blocked'
# result.is_blocked == True
# result.field_results contains currency blocking entry
```

### Stale Result Detection

```python
engine = ParityEngine(approved, eps)
result = engine.compare()
assert not engine.is_stale()  # Fresh result
assert engine.is_stale(other_version_id='ver-002')  # Stale if version changes
assert engine.is_stale(other_agreement_id='ag-999')  # Stale if agreement changes
```

### Invalid Input

```python
from pydantic import ValidationError
try:
    bad_eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=True,  # Boolean rejected
        parties=[], milestones=[],
        review_period_days=30, review_period_basis='calendar',
        dispute_behavior='mediate',
    )
except ValidationError as e:
    print(e)  # Rejects boolean where integer expected
```

## Error Handling

- `ExecutionParameters` raises `pydantic.ValidationError` for invalid input
- `ContractIR` raises `pydantic.ValidationError` for invalid input
- `ParityEngine.compare()` returns a `ParityResult` — never raises for valid inputs
- `engine.is_stale()` returns True if no binding has been computed yet

## FastAPI Integration Requirements

A future FastAPI layer must:

1. **Load** the approved `ContractIR` from trusted storage (database/file)
2. **Parse** incoming execution parameters into `ExecutionParameters` (catch `ValidationError`)
3. **Supply** trusted `agreement_id` and `version_id` — do NOT trust client-supplied IDs
4. **Call** `ParityEngine(approved_ir, execution_params).compare()`
5. **Check** `result.is_blocked` before allowing execution
6. **Store** the result with its binding for audit trail
7. **Re-validate** stale status before acting on a stored result:
   ```python
   if engine.is_stale(other_version_id=current_version_id):
       # Re-run comparison
   ```

8. **Never** treat `recommendation == 'proceed'` as execution authorization — it only means parity check passed. Actual authorization requires separate approval workflow.

## Testing

Run all P0-07 tests:
```powershell
python -m pytest api/tests/test_parity_engine.py api/tests/test_parity_rules.py api/tests/test_execution_parameters.py api/tests/test_parity_canonicalization.py api/tests/test_parity_version_binding.py api/tests/test_parity_properties.py -v
```

Run P0-06 regression:
```powershell
python -m pytest api/tests/test_ir_schema.py api/tests/test_ir_derive.py -v
```

Full backend suite:
```powershell
python -m pytest api/tests/ -v
```
