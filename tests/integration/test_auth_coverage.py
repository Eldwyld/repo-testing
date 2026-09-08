"""
Auth-coverage sweep — AgentOS.

C1 (drive-by RCE via unauthenticated goal_routes.py) was possible because a
route existed that never checked its `authorization` header at all — the
kind of bug a manual review only catches for the routes it happens to read.
This test instead walks every registered FastAPI route and asserts that
calling it with NO Authorization header never returns a 2xx. It doesn't care
*how* a route rejects the call (401 for missing auth, 422 for a route that
validates its body before running the auth check, 404/503 for missing
dependencies) — only that an unauthenticated caller never gets a success
response back. Add a new route with a real auth bug and this test fails.

Run:
    PYTHONPATH=. pytest tests/integration/test_auth_coverage.py -v -m integration
"""

import os
import re

import pytest
import requests

pytestmark = pytest.mark.integration

API_URL = "http://localhost:7777"

# Routes that are intentionally public — no bearer token required.
PUBLIC_ROUTES = {
    ("GET", "/"),
    ("GET", "/health"),
    ("GET", "/openapi.json"),
    ("GET", "/docs"),
    ("GET", "/docs/oauth2-redirect"),
    ("GET", "/redoc"),
}

_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")


def _api_reachable() -> bool:
    try:
        r = requests.get(f"{API_URL}/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


if not _api_reachable():
    pytest.skip(
        "AgentOS API not reachable at http://localhost:7777",
        allow_module_level=True,
    )


def _collect_routes():
    """(method, path) pairs for every concrete, non-public route the app
    registers, with path params substituted so the URL is concrete."""
    from api.server import app

    seen = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods:
            continue  # not an APIRoute (e.g. mounted static files)
        concrete_path = re.sub(r"\{[^{}]+\}", "test-value", path)
        for method in methods:
            if method not in _METHODS:
                continue
            key = (method, path)
            if key in PUBLIC_ROUTES:
                continue
            seen.add((method, concrete_path))
    return sorted(seen)


ROUTES = _collect_routes()


@pytest.mark.parametrize("method,path", ROUTES, ids=[f"{m} {p}" for m, p in ROUTES])
def test_route_rejects_unauthenticated_request(method, path):
    """No route outside PUBLIC_ROUTES may return 2xx with no Authorization header."""
    kwargs = {"timeout": 8}
    if method in ("POST", "PUT", "PATCH"):
        kwargs["json"] = {}
    r = requests.request(method, f"{API_URL}{path}", **kwargs)
    assert not (200 <= r.status_code < 300), (
        f"{method} {path} returned {r.status_code} with NO Authorization header — "
        f"this route is reachable without auth. Body: {r.text[:300]}"
    )


def test_route_sweep_covered_a_meaningful_number_of_routes():
    """Sanity check the sweep itself isn't silently collecting zero routes
    (e.g. because api.server failed to import) — a passing parametrize with
    no cases would look identical to a healthy run in CI output."""
    assert len(ROUTES) >= 30, (
        f"Only found {len(ROUTES)} non-public routes to check — "
        "expected several dozen. The route collector may be broken."
    )
