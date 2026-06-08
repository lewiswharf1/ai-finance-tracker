import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Transaction

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

_rules_path = Path(__file__).parent.parent / "rules.json"
_example_path = Path(__file__).parent.parent / "rules.example.json"

if _rules_path.exists():
    _rules_file = _rules_path
elif _example_path.exists():
    _rules_file = _example_path
else:
    raise FileNotFoundError("No rules file found. Copy rules.example.json to rules.json and customise it.")

with open(_rules_file) as f:
    _rules_data = json.load(f)

# Matched before any rule — these are noise, mark as Transfer to exclude
EXCLUDED: list[str] = _rules_data.get("excluded", [])

# Order matters: more specific keywords must appear before broader ones
# (e.g. "amazon music" before "amazon", "m&s simply food" before "marks & spencer")
RULES: dict[str, list[str]] = _rules_data.get("rules", {})

INCOME_CATEGORIES: frozenset[str] = frozenset(_rules_data.get("income_categories", []))
VALID_CATEGORIES: list[str] = list(RULES.keys())


def rule_categorise(merchant: str) -> str | None:
    lower = merchant.lower()

    for keyword in EXCLUDED:
        if keyword in lower:
            return "Transfer"

    for category, keywords in RULES.items():
        for keyword in keywords:
            if keyword in lower:
                return category

    return None


def llm_categorise(merchants: list[str]) -> dict[str, str]:
    results: dict[str, str] = {}
    categories_str = ", ".join(VALID_CATEGORIES)

    for i in range(0, len(merchants), 20):
        batch = merchants[i : i + 20]
        merchant_list = "\n".join(f"- {m}" for m in batch)
        prompt = (
            f"You are categorising UK bank transactions. "
            f"Assign each merchant to exactly one category from this list:\n"
            f"{categories_str}\n\n"
            f"Return a JSON array only — no explanation, no markdown. "
            f'Each element: {{"merchant": "...", "category": "..."}}\n\n'
            f"Merchants:\n{merchant_list}"
        )

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
            )
            content = response.choices[0].message.content or ""
            match = re.search(r"\[.*?\]", content, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
                for item in parsed:
                    merchant = item.get("merchant", "")
                    category = item.get("category", "")
                    if merchant and category in VALID_CATEGORIES:
                        results[merchant] = category
        except Exception:
            pass  # Leave unmatched; will remain uncategorised for manual review

    return results


def categorise_all(db: Session) -> None:
    uncategorised = (
        db.query(Transaction)
        .filter(or_(Transaction.category == "", Transaction.category.is_(None)))
        .all()
    )

    if not uncategorised:
        return

    unmatched: list[Transaction] = []

    for tx in uncategorised:
        category = rule_categorise(tx.merchant)
        if category:
            tx.category = category
        else:
            unmatched.append(tx)

    # Deduplicate merchants for LLM — one API call per unique merchant
    unique_unmatched = list({tx.merchant for tx in unmatched})
    if unique_unmatched:
        llm_results = llm_categorise(unique_unmatched)
        for tx in unmatched:
            if tx.merchant in llm_results:
                tx.category = llm_results[tx.merchant]

    db.commit()
