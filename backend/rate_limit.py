"""Simple per-key in-memory token-bucket rate limiter.

Multi-instance deployments would need Redis-backed limits, but the current
single-process preview is fine with this. Each limiter is independent and
tracks tokens per user_id (or any string key).

Usage:
    chat_limit = TokenBucket(max_tokens=20, refill_per_minute=4)
    chat_limit.check_or_raise(user.user_id)
"""
import time
import threading
from typing import Dict, Tuple

from fastapi import HTTPException


class TokenBucket:
    """Refills `refill_per_minute` tokens per minute up to `max_tokens` cap.
    Each call to `check_or_raise(key)` consumes one token; if empty → HTTP 429."""

    def __init__(self, max_tokens: int, refill_per_minute: float, name: str = "limit"):
        self.max_tokens = max_tokens
        self.refill_per_sec = refill_per_minute / 60.0
        self.name = name
        self._buckets: Dict[str, Tuple[float, float]] = {}  # key -> (tokens, last_ts)
        self._lock = threading.Lock()

    def _peek(self, key: str, now: float) -> float:
        tokens, last = self._buckets.get(key, (self.max_tokens, now))
        # Refill based on time elapsed
        tokens = min(self.max_tokens, tokens + (now - last) * self.refill_per_sec)
        return tokens

    def check_or_raise(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            tokens = self._peek(key, now)
            if tokens < 1.0:
                # Compute seconds until next token available
                wait = max(1, int((1.0 - tokens) / self.refill_per_sec)) if self.refill_per_sec > 0 else 60
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded for {self.name}. Try again in ~{wait}s.",
                    headers={"Retry-After": str(wait)},
                )
            self._buckets[key] = (tokens - 1.0, now)
