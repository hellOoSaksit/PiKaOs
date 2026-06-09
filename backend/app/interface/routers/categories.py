from fastapi import APIRouter, Depends

from ...application.vocab_service import VocabService
from ..deps import actor_header, get_vocab_service
from ..schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/sitemap/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(svc: VocabService = Depends(get_vocab_service)):
    return svc.list_categories()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate,
    svc: VocabService = Depends(get_vocab_service),
    actor: str = Depends(actor_header),
):
    return svc.create_category(body.key, body.label, body.from_keys, actor)


@router.delete("/{key}", status_code=204)
def delete_category(
    key: str,
    svc: VocabService = Depends(get_vocab_service),
    actor: str = Depends(actor_header),
):
    svc.delete_category(key, actor)
