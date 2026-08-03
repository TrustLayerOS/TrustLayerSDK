class TrustLayerError(Exception):
    """Base exception for all TrustLayer SDK errors."""

    def __init__(self, message: str, status_code: int = 0, error_code: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"message={str(self)!r}, "
            f"status_code={self.status_code}, "
            f"error_code={self.error_code!r})"
        )


class TrustLayerAuthError(TrustLayerError):
    """Raised when authentication fails (invalid or revoked API key)."""


class TrustLayerRateLimitError(TrustLayerError):
    """Raised when the rate limit is exceeded."""

    def __init__(self, message: str, retry_after: float = 60.0) -> None:
        super().__init__(message, status_code=429, error_code="rate_limit_exceeded")
        self.retry_after = retry_after


class TrustLayerNotFoundError(TrustLayerError):
    """Raised when a requested resource does not exist."""
