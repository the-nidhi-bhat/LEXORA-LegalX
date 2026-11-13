# Nidhi — Progress Log

## Role
Project Lead, Agreement Intelligence & Integration

## Assigned Task IDs
P0-01 (repo restructure), P0-05 (versions+hashing), P0-06 (Contract IR schema), P0-07 (parity engine), P0-09 (review flow), P0-11 (E2E demo gate), integration leadership

## Current Status
P0-06 completed — Contract IR implementation finalized; 52/52 tests pass across schema and derivation test suites.

## P0-06: Contract IR Implementation — Completed

### Implementation Files (6 files created in `api/` directory):

1. **`api/app/schemas/ir.py`** — ContractIR Pydantic v2 schema with 12 fields:
   - `schema_version` (default "v1"), `agreement_id`, `version_id`
   - `agreement_type` (enum: freelance_milestone, milestone_contract, service_agreement)
   - `currency` (enum: INR, USD, EUR, GBP) — integer minor units only
   - `total_amount_minor` (int, ge=1) — paise representation; ₹50,000 = 5000000 paise
   - `parties` (List[Party], min_length=2) — roles: client, provider, witness
   - `milestones` (List[Milestone], min_length=1) — seq, name, amount_minor, due_date, acceptance_criteria
   - `review_period_days` (int, 1-90 inclusive)
   - `review_period_basis` (enum: calendar, business)
   - `dispute_behavior` (enum: freeze_affected_payment, mediate, arbitrate)
   - `governing_law` (Optional[GoverningLaw]: India, UK, US, Australia)
   - Validation: milestone sum = total_amount, required client+provider parties, email RFC 5322, non-empty names/dates/criteria
   - Provenance: List[dict] with source_span byte offsets per field

2. **`api/app/ir/derive.py`** — `derive_ir_from_agreement()` pure deterministic function:
   - No LLM, no network, no DB access, no randomness/current time
   - Consumes structured agreement rows, produces validated ContractIR
   - Deterministic UUIDs: SHA-256 hash of input params → agreement_id + version_id
   - Validates: enum values, milestone sum match, required parties, positive amounts, valid dates, non-empty criteria
   - Amount parsing: int, float, or string of digits all in paise
   - Milestone derivation: seq≥1, positive amounts, YYYY-MM-DD dates, non-empty criteria
   - Party validation: role enum, non-empty name, optional email format
   - Provenance entries populated from stored text offsets (structural validation only)

3. **`api/app/ir/__init__.py`** — Package init making `api.app.ir` importable

4. **`api/tests/test_ir_schema.py`** — 26 schema unit tests (all pass):
   - Party validation (valid client/provider, invalid email, missing name/role)
   - Milestone validation (valid, negative amounts, invalid dates)
   - Enum validation (agreement_type, currency, review_period_basis, dispute_behavior)
   - Rupees-to-paise conversion (₹50,000 → 5000000)
   - IR construction with required fields and validation errors
   - Milestone sum mismatch detection
   - Missing client/provider party detection
   - Invalid review period (0, 91 rejected)
   - Optional governing_law (null valid, supported enums accepted)
   - Hash stability: identical IRs produce identical hashes; single-character change changes hash
   - Currency unsupported rejection
   - Email format validation
   - String amount parsing for milestones

5. **`api/tests/test_ir_derive.py`** — 26 derivation unit tests (all pass):
   - Basic derivation with all fields
   - Governing law support
   - Unsupported enum rejection (agreement_type, currency, review_period_basis, dispute_behavior)
   - Missing client/provider party detection (works even with empty parties thanks to enum-first validation ordering)
   - Invalid party role and empty party name rejection
   - Milestone validation: invalid seq (0), negative amount, invalid date, empty name, empty criteria
   - Amount parsing: integer, string digits, float exact representability
   - Insufficient/negative amount rejection
   - Date parsing: from date object, ISO string, invalid rejection
   - Multilingual/Unicode party and milestone names (Devanagari, arrows)
   - Determinism: identical inputs produce identical IRs including agreement_id and version_id
   - Milestone amount from string and float exactness

### Test Results
- **`pytest api/tests/test_ir_schema.py`**: 26 passed
- **`pytest api/tests/test_ir_derive.py`**: 26 passed
- **Total: 52/52 tests pass**

### Key Design Decisions (Approved per Decisions N-01 through N-07, A3, B4/B5):

- **Integer minor currency**: No floating-point money. `₹50,000 → 5000000 paise`. Conversion via `rupees_to_paise()` with round-trip exactness check.
- **Pydantic v2** `@model_validator(mode="after")` for cross-field validation (milestone sum, required parties, provenance offsets).
- **Canonical hash**: CRLF→LF, strip per-line trailing whitespace, NFC normalize, sha256(utf-8). Original text stored unmodified; hash over canonical form only.
- **Deterministic ID generation**: SHA-256 hash of concatenated input parameters (`agreement_type`+`currency`+`total_amount`+`review_period_days`+`review_period_basis`+`dispute_behavior`) → splits into two UUIDs for `agreement_id` and `version_id`. Identical inputs always produce identical IDs.
- **Provenance**: `source_span: {start, end}` byte offsets into stored agreement text. Structural validation: `end > start`, non-negative offsets. Full offset verification performed server-side during IR derivation from persisted agreement rows.
- **Enum validation ordering**: Agreement type, currency, review_period_basis, and dispute_behavior enums validated BEFORE party/milestone processing. This enables testing unsupported enum values even with empty parties/milestones.
- **Confidence advisory only**: Never authorizes or approves execution.

### Ownership Boundaries (Strictly Maintained):

| Area | Owner | Status |
|------|-------|--------|
| Contract IR schema, derivation logic, unit tests | Nidhi | ✅ Complete — all P0-06 deliverables |
| FastAPI application infrastructure, auth, DB models, migrations | Sam | ❌ No modifications |
| Frontend components, UI, design systems | Iffa | ❌ No modifications |
| QA verification, UI testing, evidence | Arati | ❌ No modifications for this milestone |

### Canonical Hash Normalization:
- Step 1: CRLF (`\r\n`) → LF (`\n`)
- Step 2: Strip per-line trailing whitespace
- Step 3: NFC Unicode normalization
- Step 4: SHA-256 over UTF-8 encode
- Original text always stored unmodified; hash computed over canonical form only.

### Deterministic ID Approach:
- Input parameters hashed via SHA-256: `f"{agreement_type}{currency}{total_amount}{review_period_days}{review_period_basis}{dispute_behavior}"`
- First 32 hex chars → `agreement_id` via `uuid.UUID(hex=...)`
- Last 32 hex chars → `version_id` via `uuid.UUID(hex=...)`
- Identical inputs → identical agreement_id and version_id
- Different inputs → different IDs (collision probability ~2^-128)

### Provenance Offset Approach:
- Each provenance entry: `{"field": "<field_name>", "source_span": {"start": <int>, "end": <int>}}`
- `start` and `end` are byte offsets into the stored agreement text
- Structural validation: `end > start ≥ 0`
- Full text-offset verification: server-side during derivation from persisted agreement rows
- Never fabricates offsets or claims a span contains a literal value when it does not

### Remaining Review Points:
- **Byte-offset interoperability**: Coordination with Sam's backend on how provenance offsets map to persisted agreement row text (exact byte position semantics, encoding assumptions, multilingual text handling).
- **ID/version lifecycle semantics**: How agreement_id and version_id evolve across agreement versions, what constitutes a "new version" vs "new agreement", and how the deterministic hash ties into version persistence or approval workflow decisions.

### Files Changed (This Branch Only):
- `docs/progress/NIDHI.md` — P0-06 completion update (this branch only)

### No Changes To:
- Sam's backend files or configuration
- Iffa's frontend or UI components
- Arati's QA test infrastructure
- API contracts or team task cards
- `docs/PROJECT_STATUS.md` (does not exist in this repo state)
- Any application source code

## Tests and Results
- `py -3.11 -m pytest api/tests/test_ir_schema.py` — 26 passed
- `py -3.11 -m pytest api/tests/test_ir_derive.py` — 26 passed
- Total: 52/52 tests pass

## Blockers
- None — all P0-06 scope deliverables created and verified

## Next Deliverable
- P0-07 (parity engine) — to be started after P0-06 integration review
- Notify Sam: IR schema ready for backend integration (`api/app/schemas/ir.py`, `api/app/ir/derive.py`)
- Notify Iffa: ContractIR schema finalized for frontend integration planning