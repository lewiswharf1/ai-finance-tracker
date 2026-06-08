import re
from datetime import date, datetime

import pdfplumber


def _parse_amount(raw: str) -> float:
    cleaned = re.sub(r"[£,\s]", "", raw.strip())
    return float(cleaned)


def _parse_date(raw: str) -> date:
    return datetime.strptime(raw.strip(), "%d %b %Y").date()


def _is_transaction_row(row: list) -> bool:
    if not row or not row[0]:
        return False
    return bool(re.match(r"\d{2} [A-Z][a-z]{2} \d{4}", str(row[0]).strip()))


def parse_statement(file_path: str) -> list[dict]:
    transactions = []

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    if len(row) < 3 or not _is_transaction_row(row):
                        continue

                    date_cell = row[0]
                    desc_cell = row[1] or ""
                    amount_cell = row[2] or ""

                    if not amount_cell.strip():
                        continue

                    parts = desc_cell.split("\n", 1)
                    merchant = parts[0].strip()
                    transaction_type = parts[1].strip() if len(parts) > 1 else ""

                    try:
                        parsed_date = _parse_date(date_cell)
                        amount = _parse_amount(amount_cell)
                    except (ValueError, TypeError):
                        continue

                    transactions.append({
                        "date": parsed_date,
                        "merchant": merchant,
                        "transaction_type": transaction_type,
                        "amount": amount,
                        "week_number": parsed_date.isocalendar().week,
                        "month": parsed_date.month,
                        "year": parsed_date.year,
                        "raw_description": desc_cell.strip(),
                    })

    return transactions
