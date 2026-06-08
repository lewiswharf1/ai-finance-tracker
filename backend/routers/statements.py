import hashlib
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from services.categoriser import categorise_all
from services.parser import parse_statement

router = APIRouter(prefix="/statements", tags=["statements"])


@router.post("/upload")
def upload_statement(file: UploadFile, db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    statement_id = hashlib.md5(file.filename.encode()).hexdigest()

    existing = db.query(Transaction).filter(Transaction.statement_id == statement_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Statement already imported")

    tmp_path = f"/tmp/{file.filename}"
    try:
        with open(tmp_path, "wb") as f:
            f.write(file.file.read())

        rows = parse_statement(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not rows:
        raise HTTPException(status_code=400, detail="No transactions found — check this is a valid Chase statement")

    transactions = []
    for row in rows:
        is_transfer = "transfer" in (row["transaction_type"] or "").lower()
        category = "Transfer" if is_transfer else ""

        transactions.append(
            Transaction(
                date=row["date"],
                merchant=row["merchant"],
                transaction_type=row["transaction_type"],
                amount=row["amount"],
                category=category,
                week_number=row["week_number"],
                month=row["month"],
                year=row["year"],
                statement_id=statement_id,
                raw_description=row["raw_description"],
            )
        )

    db.add_all(transactions)
    db.commit()

    categorise_all(db)

    return {
        "imported": len(transactions),
        "skipped": 0,
        "statement_id": statement_id,
    }
