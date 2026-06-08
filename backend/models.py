from sqlalchemy import Date, Float, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[Date] = mapped_column(Date, nullable=False)
    merchant: Mapped[str] = mapped_column(Text, nullable=False)
    transaction_type: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=True)
    week_number: Mapped[int] = mapped_column(Integer, nullable=True)
    month: Mapped[int] = mapped_column(Integer, nullable=True)
    year: Mapped[int] = mapped_column(Integer, nullable=True)
    statement_id: Mapped[str] = mapped_column(Text, nullable=True)
    raw_description: Mapped[str] = mapped_column(Text, nullable=True)
