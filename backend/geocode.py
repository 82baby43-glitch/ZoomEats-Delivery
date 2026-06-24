"""Address geocoding via OpenStreetMap Nominatim (no API key, 1 req/s rate limit).
Used to pre-populate restaurant lat/lng so the dispatch engine can score real distances.
"""
import logging
from typing import Optional, Tuple
import httpx

logger = logging.getLogger("zoomeats.geocode")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ZoomEats/1.0 (zoomeats marketplace)"


async def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """Returns (lat, lng) or None if address can't be resolved."""
    if not address or not address.strip():
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as cx:
            r = await cx.get(
                NOMINATIM_URL,
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "us"},
                headers={"User-Agent": USER_AGENT},
            )
        if r.status_code != 200:
            logger.warning(f"Nominatim {r.status_code} for '{address}'")
            return None
        data = r.json()
        if not data:
            return None
        return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        logger.warning(f"Nominatim error for '{address}': {e}")
        return None
