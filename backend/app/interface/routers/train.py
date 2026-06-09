from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from ...application.train_service import TrainService
from ..deps import actor_header, get_train_service
from ..schemas import TrainOut

router = APIRouter(prefix="/sitemap/train", tags=["train"])

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(data: bytes, filename: str) -> Response:
    return Response(content=data, media_type=_XLSX, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/template")
def download_template(svc: TrainService = Depends(get_train_service)):
    return _xlsx(svc.template(), "pikaos-vocab-template.xlsx")


@router.get("/export/{cat_key}")
def export_vocab(cat_key: str, svc: TrainService = Depends(get_train_service)):
    return _xlsx(svc.export(cat_key), f"pikaos-vocab-{cat_key}.xlsx")


@router.get("", response_model=list[TrainOut])
def list_train(category: str | None = None, svc: TrainService = Depends(get_train_service)):
    return svc.list(category)


@router.post("", response_model=TrainOut, status_code=201)
async def upload_train(
    category: str = Form(...),
    file: UploadFile = File(...),
    svc: TrainService = Depends(get_train_service),
    actor: str = Depends(actor_header),
):
    data = await file.read()
    return svc.upload(category, file.filename, data, actor)


@router.delete("/{file_id}", status_code=204)
def delete_train(file_id: str, svc: TrainService = Depends(get_train_service)):
    svc.delete(file_id)
