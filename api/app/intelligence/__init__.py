"""P1-04 Contract Intelligence — provider-independent agreement extraction.

Product principle: **AI proposes. Rules decide.**

This package turns an ordinary-language agreement description into a *draft*
Contract IR plus provenance, confidence, missing-field detection and
clarification requests. It never approves a contract, never authorises
execution, and never fabricates a value that the source text does not support.

Layers:

- ``provider.py``      — provider protocol, request/response types, scripted provider
- ``gemini_provider.py``— real Gemini adapter (official ``google-genai`` SDK)
- ``prompting.py``     — prompt construction and injection-resistant framing
- ``parsing.py``       — strict money/date/enum parsing (no invention)
- ``models.py``        — provider-independent payload and result models
- ``extractor.py``     — the deterministic pipeline
- ``evaluation.py``    — dataset loader and metrics

The package is framework independent on purpose: it has no HTTP server, no
database, no session handling and no dependency on a specific backend. Sam can
mount it inside whichever service architecture is chosen.
"""

from api.app.intelligence.errors import (
    ExtractionRejectedError,
    IntelligenceError,
    ParsingError,
    ProviderAuthenticationError,
    ProviderError,
    ProviderMalformedResponseError,
    ProviderRateLimitError,
    ProviderSafetyError,
    ProviderServiceError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from api.app.intelligence.extractor import extract_agreement
from api.app.intelligence.models import (
    ClarificationRequest,
    ExtractionPayload,
    ExtractionResult,
    ExtractedMilestone,
    ExtractedParty,
    ExtractedValue,
    FieldProvenance,
    MissingField,
    SourceSpan,
)
from api.app.intelligence.parsing import (
    ParsedAmount,
    parse_amount,
    parse_date,
    parse_enum_value,
    parse_party_role,
    parse_review_period_days,
)
from api.app.intelligence.provider import (
    ExtractionProvider,
    ExtractionRequest,
    ProviderResponse,
    ScriptedProvider,
)
from api.app.intelligence.prompting import (
    build_extraction_request,
    build_response_schema,
    build_user_prompt,
)

__all__ = [
    "ClarificationRequest",
    "ExtractionPayload",
    "ExtractionProvider",
    "ExtractionRequest",
    "ExtractionResult",
    "ExtractedMilestone",
    "ExtractedParty",
    "ExtractedValue",
    "ExtractionRejectedError",
    "FieldProvenance",
    "IntelligenceError",
    "MissingField",
    "ParsedAmount",
    "ParsingError",
    "ProviderAuthenticationError",
    "ProviderError",
    "ProviderMalformedResponseError",
    "ProviderRateLimitError",
    "ProviderResponse",
    "ProviderSafetyError",
    "ProviderServiceError",
    "ProviderTimeoutError",
    "ProviderUnavailableError",
    "ScriptedProvider",
    "SourceSpan",
    "build_extraction_request",
    "build_response_schema",
    "build_user_prompt",
    "extract_agreement",
    "parse_amount",
    "parse_date",
    "parse_enum_value",
    "parse_party_role",
    "parse_review_period_days",
]
