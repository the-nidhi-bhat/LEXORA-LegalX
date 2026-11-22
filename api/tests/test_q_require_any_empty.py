"""B-36: require_any() with no permissions must fail closed (403)."""

from __future__ import annotations

from fastapi import Depends


def test_require_any_with_no_permissions_denies(client, sessions):
    from api.app.deps import require_any

    def _empty_route(ctx=Depends(require_any())):
        return {"ok": True}

    def _real_route(ctx=Depends(require_any("agreement:view"))):
        return {"ok": True}

    client.app.add_api_route("/_test/require-any-empty", _empty_route, methods=["GET"])
    client.app.add_api_route("/_test/require-any-view", _real_route, methods=["GET"])

    # Even the highest-privilege demo persona must be denied when the
    # dependency is given an empty permission set.
    sessions.login("owner@legalx.demo")

    denied = client.get("/_test/require-any-empty")
    assert denied.status_code == 403, denied.text
    assert denied.json()["error"]["code"] == "FORBIDDEN"

    # Control: a real permission in the same dependency still grants access,
    # so the regression is specific to the empty case.
    allowed = client.get("/_test/require-any-view")
    assert allowed.status_code == 200, allowed.text
