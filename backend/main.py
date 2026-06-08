from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import chat, statements, transactions
from services.categoriser import INCOME_CATEGORIES, VALID_CATEGORIES


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Finance Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(statements.router)
app.include_router(transactions.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/categories")
def categories():
    return {"categories": VALID_CATEGORIES, "income_categories": list(INCOME_CATEGORIES)}
