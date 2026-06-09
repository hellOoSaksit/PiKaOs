from fastapi import APIRouter, Depends

from ...application.scan_service import ScanService
from ..deps import get_scan_service
from ..schemas import ScanRequest, ScanResultOut

router = APIRouter(prefix="/sitemap", tags=["scan"])


@router.post("/scan", response_model=ScanResultOut)
def scan(body: ScanRequest, svc: ScanService = Depends(get_scan_service)):
    return svc.scan(body.url, body.category, body.pass_threshold, body.bypass_popup, body.deep)
