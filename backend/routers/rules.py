"""Read/write endpoints for the categories and keyword rules.

Keyword and income-flag edits go through PUT /rules as a whole document. Renaming
and deleting a category are separate endpoints because they also have to migrate
the transactions already filed under that category.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from services import rules
from services.categoriser import categorise_all

# Namespaced under /api because the frontend has a page at /rules, and this server
# serves both the API and the SPA on one origin — an unprefixed GET /rules would
# shadow the page on a hard refresh.
router = APIRouter(prefix="/api/rules", tags=["rules"])


def _usage(db: Session, category: str) -> int:
    return db.query(Transaction).filter(Transaction.category == category).count()


def _with_counts(db: Session, config: dict) -> dict:
    return {**config, "counts": {c: _usage(db, c) for c in config["categories"]}}


@router.get("")
def get_rules(db: Session = Depends(get_db)):
    return _with_counts(db, rules.load())


class RulesUpdate(BaseModel):
    categories: list[str]
    income_categories: list[str] = []
    excluded: list[str] = []
    rules: dict[str, list[str]] = {}


@router.put("")
def put_rules(update: RulesUpdate, db: Session = Depends(get_db)):
    """Replace the whole config. Recategorises anything the new rules now cover.

    Dropping a category here is refused if transactions still use it — deleting a
    category is a migration, so it goes through DELETE where a destination is given.
    """
    incoming = update.model_dump()

    removed = [c for c in rules.categories() if c not in incoming["categories"]]
    for category in removed:
        count = _usage(db, category)
        if count:
            raise HTTPException(
                status_code=409,
                detail=f"'{category}' still has {count} transactions — delete it with a destination category instead",
            )

    saved = rules.save(incoming)
    categorise_all(db)
    return _with_counts(db, saved)


class CategoryCreate(BaseModel):
    name: str
    income: bool = False
    keywords: list[str] = []


@router.post("/categories")
def create_category(new: CategoryCreate, db: Session = Depends(get_db)):
    name = new.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    if name == rules.EXCLUDED:
        raise HTTPException(status_code=400, detail=f"'{rules.EXCLUDED}' is reserved")

    config = rules.load()
    if name in config["categories"]:
        raise HTTPException(status_code=409, detail=f"'{name}' already exists")

    config["categories"] = config["categories"] + [name]
    config["rules"] = {**config["rules"], name: new.keywords}
    if new.income:
        config["income_categories"] = config["income_categories"] + [name]

    saved = rules.save(config)
    categorise_all(db)
    return _with_counts(db, saved)


class CategoryRename(BaseModel):
    new_name: str


@router.post("/categories/{name}/rename")
def rename_category(name: str, rename: CategoryRename, db: Session = Depends(get_db)):
    new_name = rename.new_name.strip()
    config = rules.load()

    if name not in config["categories"]:
        raise HTTPException(status_code=404, detail=f"'{name}' not found")
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    if new_name == rules.EXCLUDED:
        raise HTTPException(status_code=400, detail=f"'{rules.EXCLUDED}' is reserved")
    if new_name != name and new_name in config["categories"]:
        raise HTTPException(status_code=409, detail=f"'{new_name}' already exists")

    config["categories"] = [new_name if c == name else c for c in config["categories"]]
    config["income_categories"] = [new_name if c == name else c for c in config["income_categories"]]
    config["rules"] = {(new_name if c == name else c): kw for c, kw in config["rules"].items()}
    saved = rules.save(config)

    migrated = (
        db.query(Transaction)
        .filter(Transaction.category == name)
        .update({Transaction.category: new_name}, synchronize_session=False)
    )
    db.commit()

    return {**_with_counts(db, saved), "migrated": migrated}


@router.delete("/categories/{name}")
def delete_category(name: str, move_to: str | None = None, db: Session = Depends(get_db)):
    """Delete a category. Transactions using it must be given a destination."""
    config = rules.load()
    if name not in config["categories"]:
        raise HTTPException(status_code=404, detail=f"'{name}' not found")
    if len(config["categories"]) == 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining category")

    count = _usage(db, name)
    if count:
        if not move_to:
            raise HTTPException(
                status_code=409,
                detail=f"'{name}' has {count} transactions — pass move_to with a destination category",
            )
        if move_to == name or not rules.is_valid(move_to):
            raise HTTPException(status_code=400, detail=f"Unknown destination category '{move_to}'")

        db.query(Transaction).filter(Transaction.category == name).update(
            {Transaction.category: move_to}, synchronize_session=False
        )
        db.commit()

    config["categories"] = [c for c in config["categories"] if c != name]
    config["income_categories"] = [c for c in config["income_categories"] if c != name]
    config["rules"] = {c: kw for c, kw in config["rules"].items() if c != name}

    saved = rules.save(config)
    return {**_with_counts(db, saved), "migrated": count}
