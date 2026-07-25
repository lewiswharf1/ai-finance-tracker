from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import Base, engine
from routers import chat, statements, transactions
from services.categoriser import INCOME_CATEGORIES, VALID_CATEGORIES

DIST = (Path(__file__).parent.parent / "dist").resolve()


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


# Serve the built frontend from this same server, so the whole app runs on one port.
# Registered last: anything that isn't an API route falls back to index.html so
# client-side routing (/trends, /chat) works on a hard refresh.
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(DIST):
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
