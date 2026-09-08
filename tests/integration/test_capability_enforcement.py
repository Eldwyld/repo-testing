"""
Per-agent capability enforcement — AgentOS (C2).

Before this fix, every agent authenticated to the API with the master token
(agents/live_capabilities.py:_token() always returned it), so
`agent.agent_id != "root"` was never true and every server-side
capability/budget/rate-limit/workspace check in api/server.py was silently
skipped — an agent registered with zero capabilities could still run
/shell as root. This test proves the opposite: a real non-root agent,
authenticating with its OWN token (not the master token), is actually
denied a capability it wasn't granted.

Run:
    PYTHONPATH=. pytest tests/integration/test_capability_enforcement.py -v -m integration
"""

import pytest
import requests

pytestmark = pytest.mark.integration

API_URL = "http://localhost:7777"


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


def _register(auth_headers, capabilities):
    r = requests.post(
        f"{API_URL}/agents/register",
        json={"name": "capcheck", "role": "worker", "capabilities": capabilities},
        headers=auth_headers,
    )
    assert r.status_code == 200, f"register failed: {r.text}"
    body = r.json()
    return body["agent_id"], body["token"]


class TestNonRootAgentIsActuallyRestricted:
    def test_agent_without_shell_cap_gets_403_on_shell(self, auth_headers):
        """An agent registered WITHOUT the shell capability must be denied
        /shell — not silently allowed as root."""
        agent_id, token = _register(auth_headers, capabilities=["fs_read"])
        r = requests.post(
            f"{API_URL}/shell",
            json={"command": "echo hi"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, (
            f"agent {agent_id} lacking 'shell' capability got {r.status_code} on /shell "
            f"(expected 403) — capability enforcement is not applying to this token. "
            f"Body: {r.text}"
        )

    def test_agent_with_shell_cap_is_allowed(self, auth_headers):
        """Sanity check the other direction — capability enforcement isn't
        just denying everyone. An agent explicitly granted 'shell' can use it."""
        agent_id, token = _register(auth_headers, capabilities=["shell"])
        r = requests.post(
            f"{API_URL}/shell",
            json={"command": "echo hi"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, (
            f"agent {agent_id} WITH 'shell' capability got {r.status_code} (expected 200). "
            f"Body: {r.text}"
        )

    def test_agent_token_is_not_the_master_token(self, auth_headers, master_token):
        """The bug this whole test file exists for: a registered agent's
        token must differ from the master token, and authenticating with it
        must resolve to that agent — not to 'root'."""
        agent_id, token = _register(auth_headers, capabilities=["fs_read"])
        assert token != master_token

        r = requests.get(f"{API_URL}/agents/{agent_id}", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, f"agent could not read its own record: {r.text}"
        assert r.json()["agent_id"] == agent_id

        # The agent must NOT be able to read root's record.
        r = requests.get(f"{API_URL}/agents/root", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403, (
            f"agent {agent_id} (non-admin) could read the root agent record "
            f"with status {r.status_code} — should be 403"
        )


class TestLiveCapabilitiesUsesRealAgentToken:
    """
    The actual root cause of C2: agents.live_capabilities._token() used to
    always return the master token regardless of which agent was calling,
    so every internal call (shell_exec, fs_write, ...) authenticated as
    root no matter what capabilities the calling agent was granted. This
    exercises that exact code path — not just the server-side gate the
    other tests in this file cover — by driving _call() through
    live_capabilities the same way a running agent does.
    """

    def test_call_as_capless_agent_is_denied_not_silently_root(self, auth_headers, monkeypatch):
        # NOTE: capabilities=[] is falsy and registry.register() treats a
        # falsy list the same as omitting the arg (full role-default caps)
        # — request a real, non-empty, shell-excluding capability set instead.
        agent_id, _token = _register(auth_headers, capabilities=["fs_read"])  # no shell

        import agents.live_capabilities as lc
        from pathlib import Path

        # Point the module at the same config/API the live server uses,
        # regardless of how this test process itself was launched — avoids
        # relying on import-order-sensitive env vars.
        monkeypatch.setattr(lc, "CONFIG_PATH", Path("config.json"))
        monkeypatch.setattr(lc, "API_BASE", API_URL)
        monkeypatch.setenv("AGENTOS_AGENT_ID", agent_id)

        with pytest.raises(Exception) as exc_info:
            lc._call("post", "/shell", json={"command": "echo hi"})
        assert "403" in str(exc_info.value), (
            f"expected a 403 (capability denied) calling through live_capabilities "
            f"as agent {agent_id} (no shell cap), got: {exc_info.value}"
        )

    def test_call_as_capable_agent_succeeds(self, auth_headers, monkeypatch):
        agent_id, _token = _register(auth_headers, capabilities=["shell"])

        import agents.live_capabilities as lc
        from pathlib import Path

        monkeypatch.setattr(lc, "CONFIG_PATH", Path("config.json"))
        monkeypatch.setattr(lc, "API_BASE", API_URL)
        monkeypatch.setenv("AGENTOS_AGENT_ID", agent_id)

        result = lc._call("post", "/shell", json={"command": "echo hi"})
        assert result.get("success") or result.get("exit_code") == 0, result
