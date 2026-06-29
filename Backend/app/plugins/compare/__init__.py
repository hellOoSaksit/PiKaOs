"""Compare plugin — UAT vs Production sitemap coverage + deep page diff (stateless).

A **plugin** (off unless ENABLED_MODULES lists `compare`). Was flat under app/routers/compare.py +
app/services/{compare_service,net_guard,content,sitemap}.py; moved into this self-contained folder per
[extraction-plan.md] — the same re-integration-ready code that also ships as the PiKaOs-Compare
own-app build (own-app == in-main). The registry (app/modules.py) imports `router` from here.
"""
from .router import router

__all__ = ["router"]
