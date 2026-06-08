import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from services.categoriser import INCOME_CATEGORIES

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _spending_query(db: Session, *columns):
    return (
        db.query(*columns)
        .filter(
            Transaction.category != "Transfer",
            Transaction.category.notin_(INCOME_CATEGORIES),
            Transaction.amount < 0,
        )
    )


def _income_query(db: Session, *columns):
    return (
        db.query(*columns)
        .filter(
            Transaction.category.in_(INCOME_CATEGORIES),
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

    return {"weeks": weeks, "categories": categories, "data": data, "income_categories": list(INCOME_CATEGORIES)}


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

    return {"months": months, "categories": categories, "data": data, "income_categories": list(INCOME_CATEGORIES)}


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
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.category != "Transfer")

    if category:
        q = q.filter(Transaction.category == category)
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
