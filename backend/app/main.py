"""FastAPI app entrypoint for the GuildOS Sitemap Match service."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .db import Base, SessionLocal, engine
from .routers import categories, logs, scan, train, vocab
from .seed import seed

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 0: create tables directly. Alembic migrations are provided for prod.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="GuildOS · Sitemap Match (Beta)", version="0.1.0", lifespan=lifespan)

# Single source of truth for the human-facing version label.
VERSION_LABEL = "0.1 · Sitemap · Beta"

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router)
app.include_router(vocab.router)
app.include_router(train.router)
app.include_router(scan.router)
app.include_router(logs.router)


@app.get("/health/db", tags=["health"])
def health_db():
    """Phase 0 DoD: prove the DB connection works."""
    with SessionLocal() as db:
        one = db.scalar(text("SELECT 1"))
    return {"ok": one == 1, "db": "postgres"}


@app.get("/", tags=["health"])
def root():
    return {"service": "guildos-sitemap", "version": app.version, "label": VERSION_LABEL, "docs": "/docs"}
