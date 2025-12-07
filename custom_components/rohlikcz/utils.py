from datetime import timedelta, datetime, time
import json
from zoneinfo import ZoneInfo
import re


def calculate_current_month_orders_total(orders: list) -> float|None:
    """
    Calculate the total amount of orders for the current month from JSON data.

    Args:
        orders (list): List of order dictionaries, each containing an 'orderTime' and 'priceComposition'

    Returns:
        float: Total amount of orders for the current month. Returns 0.0 if no orders
               are found for the current month or None if the JSON is invalid.

    """
    try:

        # Get current month pattern (e.g., "2025-06-")
        current_month_pattern = datetime.now().strftime("%Y-%m-")

        # Filter orders from current month and calculate sum
        total_amount = 0.0

        for order in orders:
            try:
                # Simple string check for current month
                if current_month_pattern in order['orderTime']:
                    amount = float(order['priceComposition']['total']['amount'])
                    total_amount += amount
            except (KeyError, ValueError, TypeError):
                # Skip invalid orders
                continue

        return total_amount

    except (json.JSONDecodeError, TypeError):
        return None


def extract_delivery_datetime(text: str) -> datetime | None:
    """
    Extract delivery time information from various formatted strings and return a datetime object.

    Handles three types of delivery messages:
    1. Time only (HH:MM): "delivery at 17:23"
    2. Date and time: "delivery on 26.4. at 08:00"
    3. Minutes until delivery: "delivery in approximately 3 minutes"

    Args:
        text: HTML text containing delivery time information

    Returns:
        A timezone-aware datetime object representing the delivery time, or None if no valid time found
    """

    # Replace Unicode escape sequences
    clean_text: str = text.encode('utf-8').decode('unicode_escape')

    # Get plain text without HTML tags for pattern detection
    plain_text: str = re.sub(r'<[^>]+>', '', clean_text)

    prague_tz = ZoneInfo('Europe/Prague')
    now = datetime.now(tz=prague_tz)
    current_year: int = now.year

    # Check for Type 3: Minutes until delivery
    if re.search(r'(přibližně za|za)\s*.*\s*(minut|minuty|min)', plain_text, re.IGNORECASE):
        # Extract number of minutes from highlighted span
        minutes_pattern: re.Pattern = re.compile(r'<span[^>]*color:[^>]*>([0-9]+)</span>')

        matches = re.finditer(minutes_pattern, clean_text)
        minutes_matches: list[str] = [match.group(1) for match in matches]

        if minutes_matches:
            try:
                minutes: int = int(minutes_matches[0])
                # Calculate the estimated delivery time
                return now + timedelta(minutes=minutes)
            except ValueError:
                pass

    # Check for Type 2: Date and time
    date_pattern = re.compile(r'<span[^>]*color:[^>]*>([0-9]{1,2}\.[0-9]{1,2}\.)</span>')
    time_pattern = re.compile(r'<span[^>]*color:[^>]*>([0-9]{1,2}:[0-9]{2})</span>')

    matches_date = re.finditer(date_pattern, clean_text)
    date_matches = [match.group(1) for match in matches_date]

    matches_time = re.finditer(time_pattern, clean_text)
    time_matches = [match.group(1) for match in matches_time]

    if date_matches and time_matches:
        # We have both date and time
        try:
            date_str: str = date_matches[0]  # e.g., "26.4."
            day, month = map(int, date_str.replace('.', ' ').split())

            time_str: str = time_matches[0]  # e.g., "08:00"
            hour, minute = map(int, time_str.split(':'))

            # Create full delivery datetime
            delivery_dt = datetime(
                current_year, month, day, hour, minute,
                tzinfo=prague_tz
            )

            return delivery_dt
        except (ValueError, IndexError):
            pass

    # Check for Type 1: Time only
    if time_matches:
        try:
            time_str: str = time_matches[0]  # e.g., "17:23"
            hour, minute = map(int, time_str.split(':'))

            # Use today's date with the specified time
            today = now.date()

            # If the time has already passed today, it might refer to tomorrow
            delivery_dt = datetime.combine(today, time(hour, minute))
            delivery_dt = delivery_dt.replace(tzinfo=prague_tz)

            if delivery_dt < now:
                # Time already passed today, assume it's for tomorrow
                tomorrow = today + timedelta(days=1)
                delivery_dt = datetime.combine(tomorrow, time(hour, minute))
                delivery_dt = delivery_dt.replace(tzinfo=prague_tz)

            return delivery_dt
        except (ValueError, IndexError):
            pass

    # If no structured time information was found, try to extract any time mention
    # Generic time pattern search in the plain text
    plain_time_matches = re.findall(r'\b([0-9]{1,2}:[0-9]{2})\b', plain_text)
    if plain_time_matches:
        try:
            time_str: str = plain_time_matches[0]
            hour, minute = map(int, time_str.split(':'))

            # Use today's date with the specified time
            today = now.date()

            delivery_dt = datetime.combine(today, time(hour, minute))
            delivery_dt = delivery_dt.replace(tzinfo=prague_tz)

            # If the time has already passed today, it might refer to tomorrow
            if delivery_dt < now:
                tomorrow = today + timedelta(days=1)
                delivery_dt = datetime.combine(tomorrow, time(hour, minute))
                delivery_dt = delivery_dt.replace(tzinfo=prague_tz)

            return delivery_dt
        except (ValueError, IndexError):
            pass

    # No valid time information found
    return None


def parse_delivery_datetime_string(datetime_str: str) -> datetime | None:
    """
    Parse a delivery datetime string with fallback for different formats.
    
    Args:
        datetime_str (str): Datetime string to parse
        
    Returns:
        datetime: Parsed datetime object, or None if parsing fails
    """
    if datetime_str is None:
        return None
    
    try:
        # Try parsing with microseconds first
        return datetime.strptime(datetime_str, "%Y-%m-%dT%H:%M:%S.%f%z")
    except ValueError:
        # Try without microseconds if the format doesn't match
        try:
            return datetime.strptime(datetime_str, "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            return None


def get_earliest_order(orders: list) -> dict | None:
    """
    Find the order with the earliest delivery time from a list of orders.

    Args:
        orders (list): List of order dictionaries, each containing a 'deliverySlot' with 'since' field

    Returns:
        dict: The order with the earliest delivery time, or None if no valid order found
    """
    if not orders:
        return None

    earliest_order = None
    earliest_time = None

    for order in orders:
        try:
            # Extract delivery slot and since time
            delivery_slot = order.get("deliverySlot", {})
            since_str = delivery_slot.get("since", None)

            if since_str is None:
                continue

            # Parse the datetime string (format: "%Y-%m-%dT%H:%M:%S.%f%z")
            try:
                delivery_time = datetime.strptime(since_str, "%Y-%m-%dT%H:%M:%S.%f%z")
            except ValueError:
                # Try without microseconds if the format doesn't match
                try:
                    delivery_time = datetime.strptime(since_str, "%Y-%m-%dT%H:%M:%S%z")
                except ValueError:
                    # Skip orders with invalid date format
                    continue

            # Check if this is the earliest order so far
            if earliest_time is None or delivery_time < earliest_time:
                earliest_time = delivery_time
                earliest_order = order

        except (KeyError, TypeError, AttributeError):
            # Skip orders with missing or invalid structure
            continue

    return earliest_order