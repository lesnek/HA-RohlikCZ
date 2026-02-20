from homeassistant.helpers.entity import Entity
from .hub import RohlikAccount


class BaseEntity(Entity):
    """Base class for entities in the Rohlík CZ integration."""

    # NOTE: Do not set _attr_entity_name, it breaks localization!
    _attr_has_entity_name = True

    def __init__(self, rohlik_account: RohlikAccount) -> None:
        super().__init__()

        if hasattr(self, "entity_description") and not self.translation_key:
            self._attr_translation_key = self.entity_description.key
        assert self.translation_key is not None, "translation_key is not set"

        self._rohlik_account = rohlik_account
        self._attr_device_info = rohlik_account.device_info
        self._attr_unique_id = f"{rohlik_account.data["login"]["data"]["user"]["id"]}_{self.translation_key}"
