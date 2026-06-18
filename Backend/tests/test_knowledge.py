"""Tests for the M1 knowledge / document store (phase E storage layer).

* Pure helpers (object-key/kind/scoping) → driven directly, no I/O.
* Department scoping of `list_documents` hits the real DB via a fresh engine inside
  asyncio.run (same pattern as test_engine_stubs — sidesteps the module-level-engine
  event-loop issue). MinIO/router live-path is exercised end-to-end by hand / later.

    docker compose exec backend pytest tests/test_knowledge.py
"""
from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Department, Document
from app.repositories import documents as docs_repo
from app.services import knowledge_service as ks


# --- pure helpers -----------------------------------------------------------


def test_safe_name_strips_unsafe_and_never_empty():
    assert ks.safe_name("My Notes (v2).md") == "My_Notes_v2.md"  # space→_, () stripped
    assert ks.safe_name("  ") == "file"
    assert ks.safe_name(None) == "file"


def test_build_object_key_namespaced_by_id():
    did = uuid.uuid4()
    assert ks.build_object_key(did, "a b.md") == f"documents/{did}/a_b.md"


def test_infer_kind():
    assert ks.infer_kind("text/markdown", "x") == "md"
    assert ks.infer_kind(None, "NOTES.MD") == "md"
    assert ks.infer_kind("image/png", "p.png") == "image"
    assert ks.infer_kind("application/pdf", "r.pdf") == "pdf"
    assert ks.infer_kind(None, "run.log") == "log"
    assert ks.infer_kind("application/octet-stream", "blob.bin") == "other"


# --- scope helpers (can_view / can_manage) ----------------------------------


def _user(role="member", uid=None):
    return SimpleNamespace(role=role, id=uid or uuid.uuid4())


def _doc(owner_id=None, department_id=None):
    return SimpleNamespace(owner_id=owner_id, department_id=department_id)


def test_can_view_admin_sees_all():
    assert ks.can_view(_user("admin"), _doc(department_id=uuid.uuid4()), []) is True


def test_can_view_owner_sees_own_even_other_dept():
    u = _user()
    assert ks.can_view(u, _doc(owner_id=u.id, department_id=uuid.uuid4()), []) is True


def test_can_view_org_wide_doc():
    assert ks.can_view(_user(), _doc(department_id=None), []) is True


def test_can_view_dept_member_only():
    dept = uuid.uuid4()
    assert ks.can_view(_user(), _doc(department_id=dept), [dept]) is True
    assert ks.can_view(_user(), _doc(department_id=dept), []) is False  # not a member


def test_can_manage_owner_or_admin():
    u = _user()
    assert ks.can_manage(u, _doc(owner_id=u.id)) is True
    assert ks.can_manage(u, _doc(owner_id=uuid.uuid4())) is False
    assert ks.can_manage(_user("admin"), _doc(owner_id=uuid.uuid4())) is True


# --- department scoping of list_documents (real DB) -------------------------


def test_list_documents_scopes_by_department():
    dept_a, dept_b = uuid.uuid4(), uuid.uuid4()
    d_org, d_a, d_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as s:
                s.add_all([
                    Department(id=dept_a, name_th="A", name_en="A"),
                    Department(id=dept_b, name_th="B", name_en="B"),
                ])
                await s.commit()
            async with Session() as db:
                for did, dept in ((d_org, None), (d_a, dept_a), (d_b, dept_b)):
                    await docs_repo.insert_document(
                        db, doc_id=did, owner_id=None, department_id=dept, kind="md",
                        name="n", object_key=f"k/{did}", content_type="text/markdown", size=1,
                    )
                in_a = {d.id for d in await docs_repo.list_documents(db, dept_ids=[dept_a])}
                all_ids = {d.id for d in await docs_repo.list_documents(db, dept_ids=None)}
                n_a = await docs_repo.count_documents(db, dept_ids=[dept_a])
                return in_a, all_ids, n_a
        finally:
            async with Session() as c:
                await c.execute(sql_delete(Document).where(Document.id.in_([d_org, d_a, d_b])))
                await c.execute(sql_delete(Department).where(Department.id.in_([dept_a, dept_b])))
                await c.commit()
            await eng.dispose()

    in_a, all_ids, n_a = asyncio.run(main())
    # scope [dept_a] sees org-wide + own dept, never another dept's doc
    assert d_org in in_a and d_a in in_a and d_b not in in_a
    assert n_a == 2
    # admin scope (dept_ids=None) sees everything
    assert {d_org, d_a, d_b} <= all_ids
