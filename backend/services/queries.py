"""One definition of what counts as spending, shared by the dashboard and chat.

These filters lived twice — in `routers/transactions.py` and in `services/tools.py` —
and had drifted apart, so chat and the dashboard could report different totals for the
same month. Both build their queries from here now.

Two rules are encoded:

Refunds net off their category rather than being dropped. A `Transaction.amount < 0`
filter looked like "money out" but silently deleted refunds from every total: a £37.95
refund on a `One off` purchase was neither spending nor income, so it appeared in the
transactions table while affecting no figure above it, and the month read £48.05 higher
than the bank statement. Summing the signed amount nets it instead. A category can
therefore go negative in a month whose refunds exceed its purchases, which is a true
statement about the money.

`category` is nullable, so every comparison goes through coalesce — SQL evaluates
`NULL != 'Excluded'` as NULL, not true, which drops unfiled rows from one side of a
filter while keeping the ones stored as "".
"""

from sqlalchemy import func

from models import Transaction
from services import rules


def category_name():
    """`category` as a comparable string — never NULL. See the module docstring."""
    return func.coalesce(Transaction.category, "")


def spending_filters() -> list:
    """Filed, non-excluded, non-income rows, refunds included so they net off.

    Unfiled rows are left out entirely rather than grouped under a blank name: they
    are not a category. `/transactions/summary` reports their total separately.
    """
    category = category_name()
    return [
        category != "",
        category != rules.EXCLUDED,
        category.notin_(rules.income_categories()),
    ]


def income_filters() -> list:
    """Rows in an income category, signed amount included so a reversal nets off."""
    return [category_name().in_(rules.income_categories())]
