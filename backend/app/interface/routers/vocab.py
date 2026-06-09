from fastapi import APIRouter, Depends

from ...application.vocab_service import VocabService
from ..deps import actor_header, get_vocab_service
from ..schemas import AliasCreate, TermCreate, TermOut, TermUpdate

router = APIRouter(prefix="/sitemap", tags=["vocab"])


@router.get("/vocab/{cat_key}", response_model=list[TermOut])
def merged_vocab(cat_key: str, svc: VocabService = Depends(get_vocab_service)):
    return svc.merged_vocab(cat_key)


@router.post("/vocab/{cat_key}/terms", response_model=TermOut, status_code=201)
def add_term(cat_key: str, body: TermCreate, svc: VocabService = Depends(get_vocab_service), actor: str = Depends(actor_header)):
    return svc.add_term(cat_key, body.canon, body.th, actor)


@router.patch("/terms/{term_id}", response_model=TermOut)
def update_term(term_id: str, body: TermUpdate, svc: VocabService = Depends(get_vocab_service), actor: str = Depends(actor_header)):
    return svc.update_term(term_id, body.canon, body.th, body.confirmed, actor)


@router.delete("/terms/{term_id}", status_code=204)
def delete_term(term_id: str, svc: VocabService = Depends(get_vocab_service), actor: str = Depends(actor_header)):
    svc.delete_term(term_id, actor)


@router.post("/terms/{term_id}/aliases", response_model=TermOut, status_code=201)
def add_alias(term_id: str, body: AliasCreate, svc: VocabService = Depends(get_vocab_service), actor: str = Depends(actor_header)):
    return svc.add_alias(term_id, body.text, actor)


@router.delete("/terms/{term_id}/aliases/{text}", response_model=TermOut)
def remove_alias(term_id: str, text: str, svc: VocabService = Depends(get_vocab_service), actor: str = Depends(actor_header)):
    return svc.remove_alias(term_id, text, actor)
