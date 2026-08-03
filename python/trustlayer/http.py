"""
Internal HTTP client built on httpx.
Handles authentication, retries, and error mapping.
"""

from __future__ import annotations

import time
from typing import Any, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel

from .exceptions import (
    TrustLayerAuthError,
    TrustLayerError,
    TrustLayerNotFoundError,
    TrustLayerRateLimitError,
)

T = TypeVar("T", bound=BaseModel)

DEFAULT_API_URL = "https://api.trustlayer.dev"
DEFAULT_TIMEOUT = 10.0
SDK_VERSION = "python/0.1.0"

# HTTP status codes that warrant a retry
_RETRYABLE_STATUS = {500, 502, 503, 504}
_MAX_RETRIES = 2
_RETRY_BASE_DELAY = 0.5  # seconds


class HttpClient:
    """Low-level HTTP client for TrustLayerOS."""

    def __init__(
        self,
        api_key: str,
        api_url: str = DEFAULT_API_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self._api_key = api_key
        self._base_url = api_url.rstrip("/")
        self._client = httpx.Client(
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-TrustLayer-SDK": SDK_VERSION,
            },
        )

    # ── Public request methods ────────────────────────────────────────────────

    def get(self, path: str, response_model: Type[T]) -> T:
        return self._request("GET", path, body=None, response_model=response_model)

    def post(self, path: str, body: Any, response_model: Type[T]) -> T:
        return self._request("POST", path, body=body, response_model=response_model)

    def put(self, path: str, body: Any, response_model: Type[T]) -> T:
        return self._request("PUT", path, body=body, response_model=response_model)

    def delete(self, path: str) -> dict[str, Any]:
        return self._request_raw("DELETE", path, body=None)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "HttpClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        body: Any,
        response_model: Type[T],
    ) -> T:
        raw = self._request_raw(method, path, body)
        return response_model.model_validate(raw)

    def _request_raw(
        self,
        method: str,
        path: str,
        body: Optional[Any],
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        last_error: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = self._client.request(
                    method=method,
                    url=url,
                    json=body,
                )
            except httpx.TimeoutException as exc:
                last_error = TrustLayerError(
                    f"Request timed out: {method} {path}", error_code="timeout"
                )
                if attempt < _MAX_RETRIES:
                    time.sleep(_RETRY_BASE_DELAY * (2**attempt))
                    continue
                raise last_error from exc
            except httpx.RequestError as exc:
                raise TrustLayerError(
                    f"Network error: {exc}", error_code="network_error"
                ) from exc

            if response.is_success:
                return response.json()

            # Map error responses
            if response.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                time.sleep(_RETRY_BASE_DELAY * (2**attempt))
                continue

            self._raise_for_status(response)

        # Should not reach here
        raise last_error or TrustLayerError("Unknown error")

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        try:
            data = response.json()
            message = data.get("message", response.text)
            error_code = data.get("error", "unknown_error")
        except Exception:
            message = response.text
            error_code = "unknown_error"

        status = response.status_code

        if status == 401:
            raise TrustLayerAuthError(message, status_code=status, error_code=error_code)
        if status == 429:
            retry_after = float(
                response.headers.get("Retry-After", 60)
            )
            raise TrustLayerRateLimitError(message, retry_after=retry_after)
        if status == 404:
            raise TrustLayerNotFoundError(message, status_code=status, error_code=error_code)

        raise TrustLayerError(message, status_code=status, error_code=error_code)
