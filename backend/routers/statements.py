import hashlib
import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from services.categoriser import categorise_all, uncategorised_query
from services.parser import parse_statement

router = APIRouter(prefix="/statements", tags=["statements"])


@router.post("/upload")
def upload_statement(file: UploadFile, db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = file.file.read()

    # Hash the contents, not the filename — the same statement saved under a new
    # name is still a duplicate, and a re-download of one already deleted is not.
    statement_id = hashlib.sha256(content).hexdigest()[:32]

    existing = db.query(Transaction).filter(Transaction.statement_id == statement_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="This statement has already been imported")

    fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        rows = parse_statement(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not rows:
        raise HTTPException(status_code=400, detail="No transactions found — check this is a valid Chase statement")

    transactions = []
    for row in rows:
        transactions.append(
            Transaction(
                date=row["date"],
                merchant=row["merchant"],
                transaction_type=row["transaction_type"],
                amount=row["amount"],
                # Every row imports uncategorised and goes to review. Nothing is excluded
                # on the strength of its statement type — excluding is the user's call,
                # made in Review or by a keyword in the excluded list.
                category="",
                week_number=row["week_number"],
                month=row["month"],
                year=row["year"],
                statement_id=statement_id,
                raw_description=row["raw_description"],
            )
        )

    db.add_all(transactions)
    db.commit()

    # Rules only. Whatever they don't match stays uncategorised and goes to review.
    pending = categorise_all(db)

    return {
        "imported": len(transactions),
        "uncategorised": pending,
        "statement_id": statement_id,
    }


@router.get("")
def list_statements(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Transaction.statement_id,
            func.count(Transaction.id).label("count"),
            func.min(Transaction.date).label("first_date"),
            func.max(Transaction.date).label("last_date"),
        )
        .filter(Transaction.statement_id.isnot(None))
        .group_by(Transaction.statement_id)
        .order_by(func.min(Transaction.date).desc())
        .all()
    )

    return {
        "statements": [
            {
                "statement_id": r.statement_id,
                "count": r.count,
                "first_date": r.first_date.isoformat() if r.first_date else None,
                "last_date": r.last_date.isoformat() if r.last_date else None,
            }
            for r in rows
        ]
    }


@router.delete("/{statement_id}")
def delete_statement(statement_id: str, db: Session = Depends(get_db)):
    """Remove an import outright, so a botched one can be re-uploaded."""
    deleted = (
        db.query(Transaction)
        .filter(Transaction.statement_id == statement_id)
        .delete(synchronize_session=False)
    )
    db.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Statement not found")

    return {"deleted": deleted, "remaining_uncategorised": uncategorised_query(db).count()}
