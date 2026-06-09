from fastapi import APIRouter, Depends

from ...application.log_service import LogService
from ..deps import get_log_service
from ..schemas import LogOut

router = APIRouter(prefix="/sitemap/log", tags=["log"])


@router.get("", response_model=list[LogOut])
def list_log(svc: LogService = Depends(get_log_service)):
    return svc.list()


@router.delete("", status_code=204)
def clear_log(svc: LogService = Depends(get_log_service)):
    svc.clear()
