"""Live Gemini integration test.

Runs only when ``GEMINI_API_KEY`` is configured. Without credentials the test
is skipped — live verification is then reported as pending, never as passed.
"""

import os

import pytest

from api.app.intelligence.extractor import extract_agreement
from api.app.intelligence.gemini_provider import (
    API_KEY_ENV_VAR,
    GeminiExtractionProvider,
    is_configured,
)

DESCRIPTION = (
    "Freelance milestone agreement between Nidhi Bhat (client) and Sam Rao (provider) "
    "for the design and build of a website. Total fee INR 50,000. "
    "Milestone 1: Design, INR 20,000, due 1 December 2026, acceptance criteria: "
    "signed-off design mockups. Milestone 2: Implementation, INR 30,000, due "
    "15 January 2027, acceptance criteria: site deployed to production. "
    "Review period 30 calendar days. Disputes are resolved by mediation. "
    "Governing law: India."
)

pytestmark = pytest.mark.skipif(
    not is_configured(),
    reason=f"{API_KEY_ENV_VAR} is not configured; live verification is pending",
)


def test_live_gemini_extraction_produces_a_reviewable_draft():
    """A live extraction returns a reviewable result, never an approval."""
    provider = GeminiExtractionProvider()
    result = extract_agreement(DESCRIPTION, provider)
    assert result.provider == "gemini"
    assert result.status in ("complete", "needs_clarification")
    assert result.approved is False
    assert result.human_review_required is True
    if result.status == "complete":
        assert result.contract_ir is not None
        assert result.contract_ir.total_amount_minor == 5000000


def test_live_gemini_never_receives_the_api_key_in_the_prompt():
    """The key stays in the SDK client, never in the prompt text."""
    provider = GeminiExtractionProvider()
    from api.app.intelligence.prompting import build_extraction_request

    request = build_extraction_request(DESCRIPTION)
    key = os.environ.get(API_KEY_ENV_VAR, "")
    assert key not in request.prompt
    assert key not in request.system_instruction
