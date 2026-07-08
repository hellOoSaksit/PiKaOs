"""MCP tool catalog over HTTP (`/api/mcp`) — the Core half of the MCP gateway.

Every plugin's routes already mount into one app, so reflecting that app exposes Core's and every
plugin's surface with no plugin-side code. Two filters gate it, both deny-by-default: the operator's
allowlist (a RESERVED settings key — widening it is `plugins.manage` authority) and the caller's own
permissions.

`call` **re-enters the ASGI app** rather than invoking the endpoint function. That is the load-bearing
decision here: a direct call would skip `Depends(require_perm(...))`, request validation and middleware,
forcing this module to re-implement authorization — where it would drift from the routes it mirrors.
Re-entry keeps authorization owned, exactly once, by the code that already owns it. The transport is
in-process (`ASGITransport`); nothing leaves the container.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from httpx import ASGITransport, AsyncClient

from .. import identity, mcp_catalog
from ..identity import UserLike, get_current_user, require_perm
from ..schemas import McpAllowlistIn, McpAllowlistOut, McpCallIn, McpCallOut, McpToolsOut

router = APIRouter(prefix="/api/mcp", tags=["mcp"])
log = logging.getLogger("pikaos.mcp")

# Argument names whose values never reach a log line.
_SECRETISH = ("password", "token", "secret", "key", "credential")


def _not_found() -> HTTPException:
    """A disallowed tool and an unknown one get the same answer: the catalog never discloses what
    exists but is not allowlisted."""
    return HTTPException(status_code=404, detail="Not found")


def _redact(arguments: dict) -> dict:
    """Shapes, not values — an audit line must never be where a credential leaks."""
    return {k: ("****" if any(s in k.lower() for s in _SECRETISH) else type(v).__name__)
            for k, v in arguments.items()}


@router.get("/tools", response_model=McpToolsOut)
async def list_tools(request: Request, user: UserLike = Depends(get_current_user)) -> McpToolsOut:
    """Allowlisted tools this caller may actually invoke. Listing is per-caller, so an operator's
    grant never reveals a tool the caller's role cannot use.

    Reached through the `identity` module rather than a from-import: a from-import binds the name at
    import time, which would leave this calling the deny-all bootstrap provider after the auth plugin
    rebinds it (and would make the authz tests pass against nothing). `provider_for` takes the app.
    """
    provider = identity.provider_for(request.app)
    tools = [
        {"name": t.name, "description": t.description, "input_schema": t.input_schema, "effect": t.effect}
        for t in mcp_catalog.allowed_tools(request.app)
        if await provider.has_perm(user, t.permission)
    ]
    return McpToolsOut(tools=tools)


@router.post("/call", response_model=McpCallOut)
async def call_tool(body: McpCallIn, request: Request,
                    user: UserLike = Depends(get_current_user)) -> McpCallOut:
    tool = next((t for t in mcp_catalog.allowed_tools(request.app) if t.name == body.name), None)
    if tool is None:
        raise _not_found()

    # `extra` keys must not collide with LogRecord's own attributes — `args` is reserved and makes
    # logging raise KeyError the moment this logger is actually enabled.
    log.info("mcp call", extra={"tool": tool.name, "effect": tool.effect,
                                "tool_args": _redact(body.arguments)})

    # Path params substitute into the path; `body` is the JSON payload; everything else is a query param.
    path, query, json_body = tool.path, {}, None
    for key, value in body.arguments.items():
        placeholder = "{" + key + "}"
        if placeholder in path:
            path = path.replace(placeholder, str(value))
        elif key == "body":
            json_body = value
        else:
            query[key] = value

    auth = request.headers.get("Authorization")
    headers = {"Authorization": auth} if auth else {}
    async with AsyncClient(transport=ASGITransport(app=request.app), base_url="http://mcp") as client:
        response = await client.request(tool.method, path, params=query, json=json_body, headers=headers)

    if response.status_code >= 400:
        # The inner route's own authz/validation spoke. Forward its status; never its body — stack
        # traces and SQL stay in server logs (rule 10).
        raise HTTPException(status_code=response.status_code, detail="Tool call failed")
    return McpCallOut(result=response.json())


@router.get("/allowlist", response_model=McpAllowlistOut)
async def get_allowlist(user: UserLike = Depends(require_perm("plugins.manage"))) -> McpAllowlistOut:
    """The allowlist names the whole surface an external AI can reach — not general-audience config."""
    return McpAllowlistOut(entries=mcp_catalog.read_allowlist())


@router.put("/allowlist", response_model=McpAllowlistOut)
async def put_allowlist(body: McpAllowlistIn,
                        user: UserLike = Depends(require_perm("plugins.manage"))) -> McpAllowlistOut:
    """Widening what an external AI may invoke is the same authority as installing a plugin — never
    `options.manage` (git_installer.py K4)."""
    return McpAllowlistOut(entries=mcp_catalog.write_allowlist(body.entries))
