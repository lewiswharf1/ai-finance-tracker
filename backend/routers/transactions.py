import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from services import rules
from services.categoriser import categorise_all, uncategorised_query

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _spending_query(db: Session, *columns):
    """Filed, non-excluded money out.

    Everything here goes through coalesce because `category` is nullable and SQL's
    NULL comparisons are NULL, not true — a bare `!=` silently dropped unfiled rows
    stored as NULL while counting the ones stored as "", so identical unfiled
    transactions landed on opposite sides of the same filter.

    Unfiled rows are excluded outright rather than grouped under a blank name: they
    are not a category, and a nameless bar in the breakdown is unreadable. Their
    total is reported separately by /summary so the review prompt can name it.
    """
    category = func.coalesce(Transaction.category, "")
    return (
        db.query(*columns)
        .filter(
            category != "",
            category != rules.EXCLUDED,
            category.notin_(rules.income_categories()),
            Transaction.amount < 0,
        )
    )


def _income_query(db: Session, *columns):
    return (
        db.query(*columns)
        .filter(
            Transaction.category.in_(rules.income_categories()),
            Transaction.amount > 0,
        )
    )


def _tx_dict(tx: Transaction) -> dict:
    return {
        "id": tx.id,
        "date": tx.date.isoformat(),
        "merchant": tx.merchant,
        "transaction_type": tx.transaction_type,
        "amount": tx.amount,
        "category": tx.category,
        "week_number": tx.week_number,
        "month": tx.month,
        "year": tx.year,
        "statement_id": tx.statement_id,
        "raw_description": tx.raw_description,
    }


@router.get("/weekly")
def weekly_summary(year: int, month: int, db: Session = Depends(get_db)):
    spending_rows = (
        _spending_query(
            db,
            Transaction.week_number,
            Transaction.category,
            func.round(func.sum(-Transaction.amount), 2).label("total"),
        )
        .filter(Transaction.year == year, Transaction.month == month)
        .group_by(Transaction.week_number, Transaction.category)
        .order_by(Transaction.week_number)
        .all()
    )
    income_rows = (
        _income_query(
            db,
            Transaction.week_number,
            Transaction.category,
            func.round(func.sum(Transaction.amount), 2).label("total"),
        )
        .filter(Transaction.year == year, Transaction.month == month)
        .group_by(Transaction.week_number, Transaction.category)
        .order_by(Transaction.week_number)
        .all()
    )

    all_rows = list(spending_rows) + list(income_rows)
    weeks = sorted({r.week_number for r in all_rows})
    categories = sorted({r.category for r in spending_rows}) + sorted({r.category for r in income_rows})
    data = [{"week": r.week_number, "category": r.category, "total": float(r.total)} for r in all_rows]

    return {"weeks": weeks, "categories": categories, "data": data, "income_categories": rules.income_categories()}


@router.get("/monthly")
def monthly_summary(year: int, db: Session = Depends(get_db)):
    spending_rows = (
        _spending_query(
            db,
            Transaction.month,
            Transaction.category,
            func.round(func.sum(-Transaction.amount), 2).label("total"),
        )
        .filter(Transaction.year == year)
        .group_by(Transaction.month, Transaction.category)
        .order_by(Transaction.month)
        .all()
    )
    income_rows = (
        _income_query(
            db,
            Transaction.month,
            Transaction.category,
            func.round(func.sum(Transaction.amount), 2).label("total"),
        )
        .filter(Transaction.year == year)
        .group_by(Transaction.month, Transaction.category)
        .order_by(Transaction.month)
        .all()
    )

    all_rows = list(spending_rows) + list(income_rows)
    months = sorted({r.month for r in all_rows})
    categories = sorted({r.category for r in spending_rows}) + sorted({r.category for r in income_rows})
    data = [{"month": r.month, "category": r.category, "total": float(r.total)} for r in all_rows]

    return {"months": months, "categories": categories, "data": data, "income_categories": rules.income_categories()}


@router.get("/periods")
def periods(db: Session = Depends(get_db)):
    """Which year/month pairs actually hold transactions, newest first.

    The dashboard's year list used to be a hardcoded [2024, 2025, 2026], which goes
    stale and claims data that may not exist. `latest` also lets the dashboard open
    on the most recent month on file rather than on today — a tracker fed by monthly
    statements would otherwise greet you with an empty page for most of the month.
    """
    rows = (
        db.query(Transaction.year, Transaction.month)
        .filter(Transaction.year.isnot(None), Transaction.month.isnot(None))
        .distinct()
        .order_by(Transaction.year.desc(), Transaction.month.desc())
        .all()
    )

    return {
        "years": sorted({r.year for r in rows}, reverse=True),
        "periods": [{"year": r.year, "month": r.month} for r in rows],
        "latest": {"year": rows[0].year, "month": rows[0].month} if rows else None,
    }


@router.get("/summary")
def month_summary(year: int, month: int, db: Session = Depends(get_db)):
    """The three numbers the dashboard leads with, plus the category breakdown.

    Computed here rather than derived in the browser from /monthly so that January
    can compare against the previous December — a year-scoped response cannot.
    Spending totals use the same filters as every other view, so the headline and
    the matrix can never disagree.
    """

    def spent_in(y: int, m: int) -> float:
        total = (
            _spending_query(db, func.sum(-Transaction.amount))
            .filter(Transaction.year == y, Transaction.month == m)
            .scalar()
        )
        return round(float(total or 0), 2)

    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)

    category_rows = (
        _spending_query(
            db,
            Transaction.category,
            func.round(func.sum(-Transaction.amount), 2).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(Transaction.year == year, Transaction.month == month)
        .group_by(Transaction.category)
        .all()
    )
    categories = sorted(
        ({"category": r.category, "total": float(r.total), "count": r.count} for r in category_rows),
        key=lambda c: -c["total"],
    )

    income = (
        _income_query(db, func.sum(Transaction.amount))
        .filter(Transaction.year == year, Transaction.month == month)
        .scalar()
    )

    in_month = db.query(Transaction).filter(Transaction.year == year, Transaction.month == month)
    pending = uncategorised_query(db).filter(Transaction.year == year, Transaction.month == month)

    # Money out that no category claims yet. Kept out of `spent` — see _spending_query —
    # so the prompt to review can say how much is still unaccounted for.
    pending_out = (
        pending.with_entities(func.sum(-Transaction.amount)).filter(Transaction.amount < 0).scalar()
    )

    return {
        "year": year,
        "month": month,
        "spent": spent_in(year, month),
        "income": round(float(income or 0), 2),
        "previous": {"year": prev_year, "month": prev_month, "spent": spent_in(prev_year, prev_month)},
        "categories": categories,
        "uncategorised_spend": round(float(pending_out or 0), 2),
        "counts": {
            "transactions": in_month.count(),
            "excluded": in_month.filter(Transaction.category == rules.EXCLUDED).count(),
            "uncategorised": pending.count(),
        },
    }


@router.get("/trends")
def trends(db: Session = Depends(get_db)):
    rows = (
        _spending_query(
            db,
            Transaction.week_number,
            Transaction.year,
            Transaction.month,
            func.round(func.sum(-Transaction.amount), 2).label("total"),
        )
        .group_by(Transaction.year, Transaction.week_number, Transaction.month)
        .order_by(Transaction.year, Transaction.week_number)
        .all()
    )

    data = [
        {"week": r.week_number, "year": r.year, "month": r.month, "total": r.total}
        for r in rows
    ]
    return {"data": data}


@router.get("/list")
def transaction_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    category: Optional[str] = Query(None),
    merchant: Optional[str] = Query(None, description="Case-insensitive substring of the payee name"),
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    uncategorised: bool = Query(False, description="Only transactions awaiting review"),
    db: Session = Depends(get_db),
):
    if uncategorised:
        q = uncategorised_query(db)
    elif category:
        # Naming a category is the user asking for exactly it — Excluded included, which
        # is the only way those rows are visible anywhere in the app.
        q = db.query(Transaction).filter(Transaction.category == category)
    else:
        # coalesce, not a bare !=: category is nullable, and SQL's NULL != 'Excluded'
        # is NULL, which would quietly drop every row still awaiting review.
        q = db.query(Transaction).filter(func.coalesce(Transaction.category, "") != rules.EXCLUDED)

    if merchant:
        q = q.filter(Transaction.merchant.ilike(f"%{merchant}%"))
    if month:
        q = q.filter(Transaction.month == month)
    if year:
        q = q.filter(Transaction.year == year)

    total = q.count()
    pages = math.ceil(total / page_size) if total > 0 else 1
    items = (
        q.order_by(Transaction.date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "transactions": [_tx_dict(tx) for tx in items],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/review")
def review_queue(db: Session = Depends(get_db)):
    """Uncategorised transactions grouped by merchant — one card per merchant, not per row.

    A statement with 40 unmatched rows is usually a dozen or so distinct merchants,
    and reviewing 40 of anything is a chore that gets abandoned.
    """
    groups = (
        uncategorised_query(db)
        .with_entities(
            Transaction.merchant,
            func.count(Transaction.id).label("count"),
            func.round(func.sum(Transaction.amount), 2).label("total"),
            func.min(Transaction.date).label("first_date"),
            func.max(Transaction.date).label("last_date"),
        )
        .group_by(Transaction.merchant)
        .order_by(func.count(Transaction.id).desc(), Transaction.merchant)
        .all()
    )

    return {
        "merchants": [
            {
                "merchant": g.merchant,
                "count": g.count,
                "total": float(g.total or 0),
                "first_date": g.first_date.isoformat() if g.first_date else None,
                "last_date": g.last_date.isoformat() if g.last_date else None,
                # First option is the default; any others are shorter stems the user
                # can take in one click when the tail varies per transaction.
                "keyword_options": rules.suggest_keywords(g.merchant),
            }
            for g in groups
        ],
        "total": sum(g.count for g in groups),
    }


class ReviewDecision(BaseModel):
    merchant: str
    category: str
    add_rule: bool = False
    keyword: str | None = None


@router.post("/review")
def resolve_merchant(decision: ReviewDecision, db: Session = Depends(get_db)):
    """Categorise every pending transaction for one merchant, optionally saving a rule."""
    if not rules.is_valid(decision.category):
        raise HTTPException(status_code=400, detail=f"Unknown category '{decision.category}'")

    updated = (
        uncategorised_query(db)
        .filter(Transaction.merchant == decision.merchant)
        .update({Transaction.category: decision.category}, synchronize_session=False)
    )
    db.commit()

    swept = 0
    if decision.add_rule:
        keyword = (decision.keyword or rules.suggest_keyword(decision.merchant)).strip().lower()
        if not keyword:
            raise HTTPException(status_code=400, detail="Keyword cannot be empty")

        config = rules.load()
        if decision.category == rules.EXCLUDED:
            config["excluded"] = config["excluded"] + [keyword]
        else:
            config["rules"][decision.category] = config["rules"].get(decision.category, []) + [keyword]
        rules.save(config)

        # The new rule may cover other merchants still in the queue — clear them now
        before = uncategorised_query(db).count()
        categorise_all(db)
        swept = before - uncategorised_query(db).count()

    return {"updated": updated, "also_matched": swept, "remaining": uncategorised_query(db).count()}


class CategoryUpdate(BaseModel):
    category: str


@router.patch("/{transaction_id}")
def update_category(transaction_id: int, update: CategoryUpdate, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if update.category and not rules.is_valid(update.category):
        raise HTTPException(status_code=400, detail=f"Unknown category '{update.category}'")

    tx.category = update.category
    db.commit()
    db.refresh(tx)
    return _tx_dict(tx)
