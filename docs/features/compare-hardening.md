# Compare/Sitemap Hardening — ความเสี่ยง + แนวทางแก้

> Compare/Audit เป็น **ทางเดียวที่ backend ยิง HTTP ออกไปยัง URL ที่ผู้ใช้ป้อนเอง** ([compare.md](compare.md) ย้ำ).
> ไฟล์นี้รวบความเสี่ยงด้านความปลอดภัยของเส้นทางนี้ + design การแก้ — **อ่านก่อนเปิด compare/audit สู่ผู้ใช้จริง**.
> สรุปสั้นอยู่ใน [`../process/lessons.md §C`](../process/lessons.md); ความเสี่ยงทั้งระบบอยู่ [risk-mitigation.md](../architecture/risk-mitigation.md).

## Current Understanding

3 endpoint ใน [`routers/compare.py`](../../Backend/app/routers/compare.py) — `POST /api/compare`,
`/api/compare/deep`, `/api/compare/render` — ทุกตัว `Depends(get_current_user)` (ต้องล็อกอิน)
แต่**ไม่มีอย่างอื่น**: ไม่มี per-permission, ไม่มี rate-limit, และ**ไม่มีการกรองปลายทางของ URL**.
[`compare_service.py`](../../Backend/app/services/compare_service.py) ยิง `httpx` ตรงไปยัง
`prodBase`/`uatBase`/`sitemapUrl` ที่ผู้ใช้ส่งมา (`_probe`, `render_page`, `fetch_page`,
`fetch_sitemap_urls`) โดยไม่ตรวจ host.

## 1. [P0] SSRF — server ยิงไปยัง host ภายในได้ — ✅ แก้แล้ว (A7)

> **[2026-06-15] Implemented** ใน [`services/net_guard.py`](../../Backend/app/services/net_guard.py):
> upfront `assert_public_url()` (router → HTTP 400) + httpx request event hook ที่ fire ทุก request
> รวม redirect (`guarded_event_hooks()`), toggle `compare_ssrf_block_private` + allowlist `compare_url_allowlist`.
> Test: [`tests/test_net_guard.py`](../../Backend/tests/test_net_guard.py) (network-free). คงเหลือ: **DNS-rebinding**
> (resolve→pin IP) ยังไม่ทำ — ดู note ใน `assert_public_url`. รายละเอียด design เดิมด้านล่าง.

### Observation
- `swap_origin()` / `compare()` รับ `uatBase`, `prodBase`, `sitemapUrl` เป็น netloc อะไรก็ได้ →
  ผู้ใช้ป้อน `http://169.254.169.254/...` (cloud metadata), `http://minio:9000`, `http://localhost`,
  `http://10.x/`, redirect ภายใน — server จะยิงให้.
- `render_page()` **คืน HTML เต็ม** (`RenderOut.html`, `follow_redirects=True`) → ไม่ใช่แค่ probe
  แต่ **อ่านเนื้อหา** host ภายในกลับมาให้ผู้ใช้เห็น = SSRF อ่านข้อมูลได้จริง (รุนแรงสุดในชุดนี้).
- `_probe()` ทำ HEAD→GET, deep mode โหลด body + ไล่ image/link → ทุกทางยิง URL ผู้ใช้.

### Recommendation — guard กลางที่เดียว (เฟส A7) ใช้ร่วม compare + audit
- ฟังก์ชัน `assert_public_url(url)` ใน `services/` ใหม่ (เช่น `net_guard.py`): parse → resolve DNS →
  ปฏิเสธถ้า IP เป็น private/loopback/link-local/reserved (`ipaddress.ip_address(...).is_private` ฯลฯ),
  ปฏิเสธ scheme ที่ไม่ใช่ http/https, และ (ตัวเลือก) allowlist host ของงานนั้น.
- เรียก guard **ก่อนทุก request** — ทั้ง entry URL และ **หลัง redirect ทุกครั้ง** (ใช้ httpx event hook
  หรือ `follow_redirects=False` แล้วตรวจ `Location` เองทีละชั้น) เพราะ redirect ภายในคือช่องหลัก.
- `render_page` เข้มพิเศษ: เพราะคืน body — อย่างน้อยต้องผ่าน guard + พิจารณาจำกัด content-type/ขนาด (มี `compare_render_max_chars` แล้ว).
- config: `compare_ssrf_block_private` (default `True`), `compare_url_allowlist` (ว่าง = อนุญาตทุก public host).

### Pros / Cons / Impact
- **Pros**: ปิดช่อง SSRF ทั้งหมดที่จุดเดียว, ใช้ซ้ำกับ audit's Discovery (`checklist-audit.md §3.0`).
- **Cons**: DNS-resolve เพิ่ม latency เล็กน้อย; ต้องระวัง DNS-rebinding (resolve ครั้งเดียวแล้ว pin IP ที่จะต่อ).
- **Impact**: เพิ่มไฟล์ guard + แก้จุดสร้าง `httpx.AsyncClient` 3 จุดใน compare_service; test mock เพิ่ม case private-IP.

## 2. [P1] ไม่มี authz ละเอียด + ไม่มี rate-limit

### Observation
แค่ล็อกอินก็ยิง compare/render ได้ → ผู้ใช้คนเดียวยิงพันรอบ = ใช้ backend เป็น proxy/DoS amplifier
(แต่ละ compare ยิง sitemap ทั้งชุด × 2 ฝั่ง พร้อมกันถึง `compare_max_concurrency`).

### Recommendation
- ผูก `require_perm("compare.run")` เมื่อ RBAC server-side (เฟส A1) พร้อม.
- Rate-limit ต่อผู้ใช้ผ่าน Redis (เช่น token bucket — ใช้ `redis_client.py` ที่มีอยู่) ต่อ endpoint;
  ค่าใน config (`compare_rate_per_min`).
- **Impact**: เพิ่ม dependency ใน 3 route + helper ใน `redis_client.py`; ไม่แตะ logic เปรียบเทียบ.

## 3. [P2/P3] ความทนทาน (robustness) — ไม่ใช่ security แต่ควรเก็บ

- [P2] ไม่รองรับ `sitemap.xml.gz` (sitemap index แบบ gzip) → บางเว็บอ่านไม่ได้. แก้ที่ `sitemap.py`.
- [P3] `max_sitemaps` / ลิมิตบางตัว hardcode → ย้ายเข้า `config.py` ให้ปรับได้.
- [P3] GET fallback ใน `_probe()` โหลด body เต็มเพื่อเช็ก status → ดึง `stream=True`/อ่านแค่ status มาช่วยลด bandwidth.

## ลำดับการทำ

- ✅ **A7 (SSRF)** — เสร็จ 2026-06-15 (§1). คงเหลือ: DNS-rebinding pin-IP.
- ⬜ **§2 (authz + rate-limit)** — รอ A1 (RBAC) แล้วผูก `require_perm("compare.run")` + rate-limit ผ่าน Redis ที่มีอยู่.
- ⬜ **§3 (robustness)** — ทำเมื่อเจอเว็บจริงที่ติดปัญหา.

อ้างอิงลำดับรวม: [improvement-plan.md เฟส A](../process/improvement-plan.md).
