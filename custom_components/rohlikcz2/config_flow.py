import logging
from typing import Any

from homeassistant.const import CONF_PASSWORD, CONF_EMAIL
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
import voluptuous as vol

from .const import DOMAIN
from .errors import InvalidCredentialsError
from .rohlik_api import RohlikCZAPI



_LOGGER = logging.getLogger(__name__)


async def validate_input(hass: HomeAssistant, data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Validate the user input allows us to connect.
    Data has the keys from DATA_SCHEMA with values provided by the user.
    """

    api = RohlikCZAPI(data[CONF_EMAIL], data[CONF_PASSWORD])  # type: ignore[Any]

    reply = await api.get_data()

    title: str = reply["login"]["data"]["user"]["name"]

    return title, data


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):

    CONNECTION_CLASS = config_entries.CONN_CLASS_CLOUD_POLL
    VERSION = 0.1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> config_entries.FlowResult:

        data_schema: dict[Any, Any] = {
            vol.Required(CONF_EMAIL, default="e-mail"): str,
            vol.Required(CONF_PASSWORD, default="password"): str
        }

        # Set dict for errors
        errors: dict[str, str] = {}

        # Steps to take if user input is received
        if user_input is not None:
            try:
                info, data = await validate_input(self.hass, user_input)
                return self.async_create_entry(title=info, data=data)

            except InvalidCredentialsError:
                errors["base"] = "Invalid credentials provided"

            except Exception:  # pylint: disable=broad-except
                _LOGGER.exception("Unknown exception")
                errors["base"] = "Unknown exception"

        # If there is no user input or there were errors, show the form again, including any errors that were found with the input.
        return self.async_show_form(
            step_id="user", data_schema=vol.Schema(data_schema), errors=errors
        )
