"""Rohlík CZ custom component."""
from __future__ import annotations

import logging
import pathlib

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_EMAIL, CONF_PASSWORD
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .hub import RohlikAccount
from .services import register_services

_WWW_DIR = pathlib.Path(__file__).parent / "www"

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = ["sensor", "binary_sensor", "todo", "calendar"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register static www assets once at startup."""
    from homeassistant.components.http import StaticPathConfig
    await hass.http.async_register_static_paths([
        StaticPathConfig("/rohlikcz2/rohlikcz-cart-card.js", str(_WWW_DIR / "rohlikcz-cart-card.js"), False),
        StaticPathConfig("/rohlikcz2/rohlikcz-shopping-list-card.js", str(_WWW_DIR / "rohlikcz-shopping-list-card.js"), False),
    ])
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Rohlik integration from a config entry flow."""
    rohlik_hub = RohlikAccount(hass, entry.data[CONF_EMAIL], entry.data[CONF_PASSWORD])
    await rohlik_hub.async_update()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = rohlik_hub

    # Register services
    register_services(hass)

    _LOGGER.info("Setting up platforms: %s", PLATFORMS)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _LOGGER.info("Platforms setup complete")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok


