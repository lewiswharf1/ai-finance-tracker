"""Read/write access to rules.json — the single source of truth for categories.

The file is loaded lazily and re-read whenever its mtime changes, so edits made
through the API (or by hand) take effect without restarting the server. Every
write backs up the previous version and lands atomically.
"""

import functools
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

_BACKEND = Path(__file__).parent.parent
CONFIG_PATH = _BACKEND / "rules.json"
EXAMPLE_PATH = _BACKEND / "rules.example.json"
BACKUP_PATH = _BACKEND / "rules.backup.json"

# Reserved category meaning "leave this out of every spending view". Only ever assigned
# by a user decision: chosen in the review flow, or matched by a keyword in the excluded
# list. Import never applies it on its own, whatever the statement's transaction type.
# Never user-defined — the rules editor refuses it as a category name.
EXCLUDED = "Excluded"

_cache: dict | None = None
_cache_mtime: float | None = None


def _default_config() -> dict:
    return {"categories": ["Miscellaneous"], "income_categories": [], "excluded": [], "rules": {"Miscellaneous": []}}


def _clean_keywords(keywords) -> list[str]:
    seen: list[str] = []
    for keyword in keywords or []:
        cleaned = str(keyword).strip().lower()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen


def _normalise(data: dict) -> dict:
    """Coerce any accepted shape into the current schema.

    Older files had no explicit `categories` list — the rules map was the category
    list, which made a category with zero keywords impossible to express.
    """
    rules = {str(k): _clean_keywords(v) for k, v in (data.get("rules") or {}).items()}

    categories = [str(c) for c in (data.get("categories") or list(rules.keys()))]
    categories = [c for c in dict.fromkeys(categories) if c and c != EXCLUDED]

    # A category can exist with no keywords, but every rules key must be a category
    for category in rules:
        if category not in categories and category != EXCLUDED:
            categories.append(category)
    rules = {c: rules.get(c, []) for c in categories}

    income = [c for c in dict.fromkeys(str(c) for c in (data.get("income_categories") or [])) if c in categories]

    return {
        "categories": categories,
        "income_categories": income,
        "excluded": _clean_keywords(data.get("excluded")),
        "rules": rules,
    }


def load() -> dict:
    """Return the current config, re-reading the file if it has changed on disk."""
    global _cache, _cache_mtime

    if not CONFIG_PATH.exists():
        source = json.loads(EXAMPLE_PATH.read_text()) if EXAMPLE_PATH.exists() else _default_config()
        save(_normalise(source))
        return _cache

    mtime = CONFIG_PATH.stat().st_mtime
    if _cache is not None and _cache_mtime == mtime:
        return _cache

    raw = json.loads(CONFIG_PATH.read_text())
    config = _normalise(raw)

    # Migrate legacy files in place so the schema upgrade happens exactly once
    if config != raw:
        save(config)
        return _cache

    _cache, _cache_mtime = config, mtime
    return _cache


def save(config: dict) -> dict:
    """Validate, back up, and atomically write the config. Returns what was written."""
    global _cache, _cache_mtime

    config = _normalise(config)
    if not config["categories"]:
        raise ValueError("At least one category is required")

    if CONFIG_PATH.exists():
        shutil.copy2(CONFIG_PATH, BACKUP_PATH)

    fd, tmp = tempfile.mkstemp(dir=CONFIG_PATH.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")
        os.replace(tmp, CONFIG_PATH)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise

    _cache, _cache_mtime = config, CONFIG_PATH.stat().st_mtime
    return _cache


def categories() -> list[str]:
    return load()["categories"]


def income_categories() -> list[str]:
    return load()["income_categories"]


def spending_categories() -> list[str]:
    config = load()
    return [c for c in config["categories"] if c not in config["income_categories"]]


def is_valid(category: str) -> bool:
    return category == EXCLUDED or category in categories()


@functools.lru_cache(maxsize=512)
def _pattern(keyword: str) -> re.Pattern:
    """Compile a keyword into a whole-word matcher.

    A bare substring test is too eager: "round" swallows "Ground Coffee" and
    "Roundhouse", and nothing in the UI reveals a wrongly excluded row. Word
    boundaries via lookarounds rather than \\b, so a keyword starting or ending in
    punctuation ("m&s", "co-op") still anchors correctly.
    """
    prefix = r"(?<!\w)" if re.match(r"\w", keyword) else ""
    suffix = r"(?!\w)" if re.search(r"\w$", keyword) else ""
    return re.compile(prefix + re.escape(keyword) + suffix)


def matches(keyword: str, merchant: str) -> bool:
    """Whether a keyword applies to a merchant, on whole-word boundaries."""
    cleaned = (keyword or "").strip().lower()
    if not cleaned:
        return False
    return _pattern(cleaned).search((merchant or "").lower()) is not None


def match(merchant: str) -> str | None:
    """Categorise a merchant by keyword, longest match wins.

    Longest-match rather than first-match means the file has no order dependence:
    "amazon music" beats "amazon" no matter which is listed first.
    """
    config = load()

    for keyword in config["excluded"]:
        if matches(keyword, merchant):
            return EXCLUDED

    best: str | None = None
    best_length = 0
    for category, keywords in config["rules"].items():
        for keyword in keywords:
            if len(keyword) > best_length and matches(keyword, merchant):
                best, best_length = category, len(keyword)

    return best


# Where a merchant string stops being an identity and starts being a per-transaction
# tail: " - Train fare" on a recurring payee, or a card/terminal number.
_STEM_CUT = re.compile(r"\s+[-–—]\s+|\s+\d{3,}\b")


def _clean_merchant(merchant: str) -> str:
    return re.sub(r"\s+", " ", (merchant or "").strip().lower())


def suggest_keyword(merchant: str) -> str:
    """The whole merchant name, lowercased.

    Chase statements give a clean payee name rather than POS noise, so the merchant
    itself is the most precise rule available and the safest default. Earlier versions
    stripped it down to one or two tokens, which produced keywords far broader than
    intended ("Round up" -> "round") and, when the tokens were not adjacent, keywords
    that failed to match even the merchant they came from ("TFL - Transport for
    London" -> "tfl transport").
    """
    return _clean_merchant(merchant)


def suggest_keywords(merchant: str) -> list[str]:
    """Candidate keywords for one merchant, most precise first.

    The stem is offered alongside the full name because a recurring payee appears
    under a different tail each time — "From WHARF SM & KE - Train fare" and
    "- Towards shopping" are one rule if cut at the separator, two if not.
    """
    full = _clean_merchant(merchant)
    if not full:
        return []

    stem = _STEM_CUT.split(full, maxsplit=1)[0].strip()
    return [full] if stem == full or not stem else [full, stem]
