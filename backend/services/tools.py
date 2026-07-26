import copy

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Transaction
from services import rules


def _category_description() -> str:
    income = rules.income_categories()
    return (
        f"Category name. Spending categories: {', '.join(rules.spending_categories())}. "
        f"Income categories (money in): {', '.join(income) if income else 'none'}."
    )

DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_spending_summary",
            "description": (
                "Get total spending broken down by category for a time period. "
                "Use for broad questions like 'what did I spend last month' or 'show my breakdown'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "description": "The year"},
                    "month": {
                        "type": "integer",
                        "description": "Month number 1-12. Omit to get the full year.",
                    },
                },
                "required": ["year"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_total",
            "description": (
                "Get the total amount spent in a specific category. "
                "Use for questions like 'how much did I spend on eating out in April'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Category name.",  # filled in per request by definitions()
                    },
                    "year": {"type": "integer"},
                    "month": {"type": "integer"},
                },
                "required": ["category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_merchants",
            "description": (
                "Get the top merchants by total amount spent. "
                "Use for 'where do I spend the most' or 'biggest recurring costs'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer"},
                    "month": {"type": "integer"},
                    "limit": {
                        "type": "integer",
                        "description": "Number of merchants to return. Default 10.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_biggest_transactions",
            "description": (
                "Get the largest individual transactions by amount. "
                "Use for 'biggest single transaction' or 'most expensive purchase'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer"},
                    "month": {"type": "integer"},
                    "limit": {
                        "type": "integer",
                        "description": "Number of transactions to return. Default 5.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_transactions",
            "description": (
                "Search for transactions by merchant name or a natural language description. "
                "Use for specific merchant lookups ('how much at Lidl') or exploratory questions "
                "('what did I buy last Saturday')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Merchant name or free-text description to search for",
                    },
                    "year": {"type": "integer"},
                    "month": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
    },
]


type Result = tuple[str, list[dict]]


def definitions() -> list[dict]:
    """Tool schemas for the chat model.

    Built per request rather than at import so that categories added or renamed in
    the rules editor are described accurately without restarting the server.
    """
    schemas = copy.deepcopy(DEFINITIONS)
    for schema in schemas:
        properties = schema["function"]["parameters"]["properties"]
        if "category" in properties:
            properties["category"]["description"] = _category_description()
    return schemas


def _base(db: Session):
    return db.query(Transaction).filter(
        Transaction.category != "Transfer",
        Transaction.amount < 0,
    )


def _tx_dict(tx: Transaction) -> dict:
    return {
        "id": tx.id,
        "date": tx.date.isoformat(),
        "merchant": tx.merchant,
        "amount": tx.amount,
        "category": tx.category or "",
    }


def get_spending_summary(db: Session, year: int, month: int = None) -> Result:
    q = (
        db.query(
            Transaction.category,
            func.round(func.sum(-Transaction.amount), 2).label("total"),
        )
        .filter(Transaction.category != "Transfer", Transaction.amount < 0)
        .filter(Transaction.year == year)
    )
    if month:
        q = q.filter(Transaction.month == month)

    rows = q.group_by(Transaction.category).order_by(func.sum(-Transaction.amount).desc()).all()

    if not rows:
        period = f"{year}-{month:02d}" if month else str(year)
        return f"No spending data found for {period}.", []

    period = f"{year}-{month:02d}" if month else str(year)
    lines = [f"Spending breakdown for {period}:"]
    grand_total = 0.0
    for row in rows:
        lines.append(f"  {row.category}: £{row.total:.2f}")
        grand_total += row.total
    lines.append(f"  Total: £{grand_total:.2f}")
    return "\n".join(lines), []


def get_category_total(db: Session, category: str, year: int = None, month: int = None) -> Result:
    is_income = category in rules.income_categories()
    amount_filter = Transaction.amount > 0 if is_income else Transaction.amount < 0
    q = db.query(Transaction).filter(Transaction.category == category, amount_filter)
    if year:
        q = q.filter(Transaction.year == year)
    if month:
        q = q.filter(Transaction.month == month)

    txns = q.order_by(Transaction.date.desc()).all()
    total = round(sum(tx.amount if is_income else -tx.amount for tx in txns), 2)

    period_parts = []
    if month:
        period_parts.append(f"month {month}")
    if year:
        period_parts.append(str(year))
    period = " of ".join(period_parts) if period_parts else "all time"
    verb = "earned" if is_income else "spent"
    text = f"Total {verb} on {category} ({period}): £{total:.2f}"
    return text, [_tx_dict(tx) for tx in txns]


def get_top_merchants(db: Session, year: int = None, month: int = None, limit: int = 10) -> Result:
    q = (
        db.query(
            Transaction.merchant,
            func.round(func.sum(-Transaction.amount), 2).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(Transaction.category != "Transfer", Transaction.amount < 0)
    )
    if year:
        q = q.filter(Transaction.year == year)
    if month:
        q = q.filter(Transaction.month == month)

    rows = (
        q.group_by(Transaction.merchant)
        .order_by(func.sum(-Transaction.amount).desc())
        .limit(limit)
        .all()
    )

    if not rows:
        return "No transaction data found.", []

    lines = [f"Top {len(rows)} merchants by spend:"]
    for row in rows:
        lines.append(f"  {row.merchant}: £{row.total:.2f} ({row.count} transaction{'s' if row.count != 1 else ''})")
    return "\n".join(lines), []


def get_biggest_transactions(db: Session, year: int = None, month: int = None, limit: int = 5) -> Result:
    q = _base(db)
    if year:
        q = q.filter(Transaction.year == year)
    if month:
        q = q.filter(Transaction.month == month)

    txns = q.order_by(Transaction.amount.asc()).limit(limit).all()

    if not txns:
        return "No transaction data found.", []

    lines = [f"Largest {len(txns)} transactions:"]
    for tx in txns:
        lines.append(f"  £{abs(tx.amount):.2f} at {tx.merchant} on {tx.date.isoformat()} ({tx.category})")
    return "\n".join(lines), [_tx_dict(tx) for tx in txns]


def search_transactions(db: Session, query: str, year: int = None, month: int = None) -> Result:
    q = (
        db.query(Transaction)
        .filter(
            Transaction.category != "Transfer",
            Transaction.merchant.ilike(f"%{query}%"),
        )
    )
    if year:
        q = q.filter(Transaction.year == year)
    if month:
        q = q.filter(Transaction.month == month)

    txns = q.order_by(Transaction.date.desc()).limit(20).all()

    if not txns:
        return f"No transactions found matching '{query}'.", []

    lines = [f"Transactions matching '{query}':"]
    for tx in txns:
        sign = "+" if tx.amount > 0 else "-"
        lines.append(
            f"  {sign}£{abs(tx.amount):.2f} at {tx.merchant} on {tx.date.isoformat()} ({tx.category})"
        )
    return "\n".join(lines), [_tx_dict(tx) for tx in txns]


def run(name: str, args: dict, db: Session) -> Result:
    dispatch = {
        "get_spending_summary": get_spending_summary,
        "get_category_total": get_category_total,
        "get_top_merchants": get_top_merchants,
        "get_biggest_transactions": get_biggest_transactions,
        "search_transactions": search_transactions,
    }
    fn = dispatch.get(name)
    if not fn:
        return f"Unknown tool: {name}", []
    return fn(db=db, **args)
