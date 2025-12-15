"""Platform for calendar integration."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, ICON_DELIVERY_CALENDAR
from .entity import BaseEntity
from .hub import RohlikAccount
from .utils import parse_orders_for_calendar

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up calendar entities for passed config_entry in HA."""
    rohlik_hub: RohlikAccount = hass.data[DOMAIN][config_entry.entry_id]  # type: ignore[Any]
    async_add_entities([RohlikDeliveryCalendar(rohlik_hub)])


class RohlikDeliveryCalendar(BaseEntity, CalendarEntity):
    """Calendar entity for Rohlik.cz delivery windows."""

    _attr_translation_key = "delivery_calendar"
    _attr_should_poll = False
    _attr_icon = ICON_DELIVERY_CALENDAR

    def __init__(self, rohlik_account: RohlikAccount) -> None:
        """Initialize the calendar entity."""
        super().__init__(rohlik_account)
        self._events: list[CalendarEvent] = []
        self._events_by_order_id: dict[str, CalendarEvent] = {}  # Track events by order ID

    def _extract_orders_list(self, data_key: str) -> list:
        """Extract orders list from API response, handling wrapped responses."""
        raw_data = self._rohlik_account.data.get(data_key)
        
        if raw_data is None:
            _LOGGER.debug("No data found for key: %s", data_key)
            return []
        
        # If it's already a list, return it
        if isinstance(raw_data, list):
            _LOGGER.debug("Found %d orders in %s", len(raw_data), data_key)
            return raw_data
        
        # If it's a dict, try to extract the list from common response structures
        if isinstance(raw_data, dict):
            # Try common response wrapper keys
            for key in ["data", "orders", "items", "results"]:
                if key in raw_data and isinstance(raw_data[key], list):
                    _LOGGER.debug("Extracted %d orders from %s.%s", len(raw_data[key]), data_key, key)
                    return raw_data[key]
            _LOGGER.warning("Expected list in %s but got dict without list field: %s", data_key, list(raw_data.keys()))
            return []
        
        _LOGGER.warning("Unexpected data type for %s: %s", data_key, type(raw_data))
        return []

    def _update_events(self) -> None:
        """Rebuild the events list from current order data."""
        next_orders = self._extract_orders_list("next_order")
        delivered_orders = self._extract_orders_list("delivered_orders")

        _LOGGER.debug(
            "Updating calendar events - next_orders: %d, delivered_orders: %d",
            len(next_orders),
            len(delivered_orders),
        )

        # Get all order IDs from both sources (for tracking which orders still exist)
        all_order_ids = set()
        for order in (next_orders or []):
            order_id = order.get('id')
            if order_id:
                all_order_ids.add(str(order_id))
        for order in (delivered_orders or []):
            order_id = order.get('id')
            if order_id:
                all_order_ids.add(str(order_id))

        # Remove events for orders that are no longer in either list
        orders_to_remove = set(self._events_by_order_id.keys()) - all_order_ids
        for order_id in orders_to_remove:
            del self._events_by_order_id[order_id]
            _LOGGER.debug("Removed calendar event for order %s (no longer in next_order or delivered_orders)", order_id)

        # Parse orders from next_order only (these have delivery slots)
        # delivered_orders don't have delivery slots, so we can't create events from them
        # but we keep existing events for orders that moved to delivered_orders
        normalized_orders = parse_orders_for_calendar(next_orders, [])
        _LOGGER.debug("Parsed %d normalized orders from next_order", len(normalized_orders))

        # Create or update events for orders in next_order (they have delivery slots)
        for order in normalized_orders:
            order_id = order['id']
            try:
                # Build description with optional details
                description_parts = []
                if order.get("status"):
                    description_parts.append(f"Status: {order['status']}")
                if order.get("items_count") is not None:
                    description_parts.append(f"Items: {order['items_count']}")
                if order.get("price"):
                    description_parts.append(f"Price: {order['price']} CZK")
                description = "\n".join(description_parts) if description_parts else None

                event = CalendarEvent(
                    start=order["start"],
                    end=order["end"],
                    summary=f"Order {order['id']}",
                    description=description,
                    uid=str(order["id"]),
                )
                
                # Update or add event
                if order_id in self._events_by_order_id:
                    _LOGGER.debug("Updating calendar event for order %s", order_id)
                else:
                    _LOGGER.debug(
                        "Created calendar event for order %s: %s to %s",
                        order_id,
                        order["start"],
                        order["end"]
                    )
                
                self._events_by_order_id[order_id] = event
                
            except (KeyError, TypeError) as e:
                _LOGGER.warning("Error creating calendar event for order %s: %s", order.get('id'), e)
                continue

        # Rebuild events list from dict (includes both new events and kept events)
        self._events = list(self._events_by_order_id.values())
        # Sort by start time
        self._events.sort(key=lambda x: x.start)

        _LOGGER.info("Calendar updated with %d events", len(self._events))

    @property
    def event(self) -> CalendarEvent | None:
        """Return the current or next upcoming event."""
        if not self._events:
            return None

        now = dt_util.now()
        
        # Find current active event (start <= now < end)
        for event in self._events:
            if event.start <= now < event.end:
                return event
        
        # Find next upcoming event (start > now)
        for event in self._events:
            if event.start > now:
                return event
        
        # No current or upcoming events
        return None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return calendar events within a datetime range."""
        if not self._events:
            return []

        # Filter events that intersect the range
        # start_date is lower bound applied to event's end (exclusive)
        # end_date is upper bound applied to event's start (exclusive)
        filtered_events = [
            event
            for event in self._events
            if event.end > start_date and event.start < end_date
        ]

        # Return sorted by start time
        filtered_events.sort(key=lambda x: x.start)
        return filtered_events

    async def async_added_to_hass(self) -> None:
        """Run when entity is added to hass."""
        await super().async_added_to_hass()
        # Initial update
        _LOGGER.debug("Calendar entity added to hass, updating events")
        self._update_events()
        # Register callback for updates
        self._rohlik_account.register_callback(self._on_data_update)

    def _on_data_update(self) -> None:
        """Handle data updates from RohlikAccount."""
        _LOGGER.debug("Calendar received data update callback")
        self._update_events()
        self.async_write_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        """Run when entity is being removed from hass."""
        self._rohlik_account.remove_callback(self._on_data_update)
        await super().async_will_remove_from_hass()

