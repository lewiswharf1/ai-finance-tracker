"""Applies the keyword rules to transactions.

Categorisation is deliberately rules-only. Anything the rules don't match is left
uncategorised and surfaced in the review flow, where the user assigns it and can
promote the decision to a rule.
"""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Transaction
from services import rules


def uncategorised_query(db: Session):
    return db.query(Transaction).filter(
        or_(Transaction.category == "", Transaction.category.is_(None))
    )


def categorise_all(db: Session) -> int:
    """Apply rules to every uncategorised transaction. Returns how many are still unmatched."""
    pending = uncategorised_query(db).all()
    if not pending:
        return 0

    # One lookup per unique merchant rather than per row
    resolved: dict[str, str | None] = {}
    unmatched = 0

    for tx in pending:
        if tx.merchant not in resolved:
            resolved[tx.merchant] = rules.match(tx.merchant)

        category = resolved[tx.merchant]
        if category:
            tx.category = category
        else:
            unmatched += 1

    db.commit()
    return unmatched
