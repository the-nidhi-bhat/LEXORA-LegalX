"""Typed errors for the extraction pipeline.

Every failure mode is explicit and named. Nothing in this package silently
falls back to a fabricated result: a provider outage produces a provider error,
not an empty extraction that looks successful.
"""


class IntelligenceError(Exception):
    """Base class for every error raised by this package."""


class ParsingError(IntelligenceError):
    """A value could not be parsed without guessing.

    ``reason`` explains why the value is unusable, so the caller can turn it
    into a clarification request instead of silently defaulting.
    """

    def __init__(self, reason: str, field: str = ""):
        self.reason = reason
        self.field = field
        super().__init__(reason)


class ExtractionRejectedError(IntelligenceError):
    """The provider output was malformed or unsupported and was rejected."""

    def __init__(self, reasons: list[str]):
        self.reasons = list(reasons)
        super().__init__("; ".join(self.reasons) or "extraction rejected")


class ProviderError(IntelligenceError):
    """Base class for provider failures.

    ``retryable`` tells the caller whether retrying the same request can
    succeed. It is a class attribute so it survives subclassing and can be
    asserted in tests without instantiating the error.
    """

    retryable = False

    def __init__(self, message: str, *, provider: str = "", status_code: int | None = None):
        self.provider = provider
        self.status_code = status_code
        super().__init__(message)


class ProviderUnavailableError(ProviderError):
    """The SDK is not installed, or no API key is configured."""


class ProviderAuthenticationError(ProviderError):
    """The provider rejected the credentials (401/403)."""

    retryable = False


class ProviderRateLimitError(ProviderError):
    """The provider rate-limited the request (429)."""

    retryable = True


class ProviderTimeoutError(ProviderError):
    """The provider did not answer within the configured timeout."""

    retryable = True


class ProviderServiceError(ProviderError):
    """The provider returned a server-side error (5xx) or a transport failure."""

    retryable = True


class ProviderSafetyError(ProviderError):
    """The provider blocked the request or the response for safety reasons."""

    retryable = False


class ProviderMalformedResponseError(ProviderError):
    """The provider answered with something that is not usable structured output."""

    retryable = False


__all__ = [
    "ExtractionRejectedError",
    "IntelligenceError",
    "ParsingError",
    "ProviderAuthenticationError",
    "ProviderError",
    "ProviderMalformedResponseError",
    "ProviderRateLimitError",
    "ProviderSafetyError",
    "ProviderServiceError",
    "ProviderTimeoutError",
    "ProviderUnavailableError",
]
