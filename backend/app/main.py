"""FastAPI app entrypoint for the PiKaOs Sitemap Match service.

Clean Architecture layering:
  domain/         entities, ports (interfaces), pure policies — no frameworks
  application/    use-case services depending only on ports
  infrastructure/ adapters: SQLAlchemy, lxml, rapidfuzz, openpyxl
  interface/      HTTP edge: DTOs, dependency wiring, routers
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .application.errors import ServiceError
from .config import get_settings
from .infrastructure import orm  # noqa: F401 — register tables on Base.metadata
from .infrastructure.db import Base, SessionLocal, engine
from .infrastructure.seed import seed
from .interface.routers import categories, logs, scan, train, vocab

settings = get_settings()
VERSION_LABEL = "0.1 · Sitemap · Beta"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 0: create tables directly. Alembic migrations are provided for prod.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="PiKaOs · Sitemap Match (Beta)", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def _service_error(_: Request, exc: ServiceError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


for r in (categories.router, vocab.router, train.router, scan.router, logs.router):
    app.include_router(r)


@app.get("/health/db", tags=["health"])
def health_db():
    with SessionLocal() as db:
        one = db.scalar(text("SELECT 1"))
    return {"ok": one == 1, "db": "postgres"}


@app.get("/", tags=["health"])
def root():
    return {"service": "pikaos-sitemap", "version": app.version, "label": VERSION_LABEL, "docs": "/docs"}
