"""Static dashboard generated from state, published to GitHub Pages.

The one thing worth watching: stress per agent, the registry, open PRs,
and the last few cycles. No JavaScript, no data source but the repo.
"""

from __future__ import annotations

import html
from pathlib import Path

from hollow.registry import Registry
from hollow.state import Store

CSS = """
:root{--bg:#f6f5f1;--fg:#16191a;--mut:#5c6462;--rule:#dedcd5;--ok:#2e7d6e;--warn:#8f6318;--bad:#97442f;--surf:#eeede6}
@media(prefers-color-scheme:dark){:root{--bg:#121514;--fg:#e8e9e5;--mut:#969d99;--rule:#272c2a;--ok:#5fbfab;--warn:#d6a354;--bad:#d98268;--surf:#1a1e1d}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:34px;margin:0 0 4px;letter-spacing:-.02em}.sub{color:var(--mut);margin:0 0 32px;font-family:ui-monospace,monospace;font-size:12.5px}
h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin:36px 0 12px;border-top:1px solid var(--rule);padding-top:14px}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);padding:8px 10px 8px 0;border-bottom:1px solid var(--rule)}
td{padding:9px 10px 9px 0;border-bottom:1px solid var(--rule);vertical-align:top;font-variant-numeric:tabular-nums}
.bar{height:8px;background:var(--surf);border-radius:4px;overflow:hidden;min-width:140px}.bar i{display:block;height:100%}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}code{font-family:ui-monospace,monospace;font-size:13px;background:var(--surf);padding:1px 5px;border-radius:3px}
ul{padding-left:20px}li{margin-bottom:4px}
"""


def _cls(load: float, cfg: dict) -> str:
    if load >= cfg["stress"]["lock_writes"]:
        return "bad"
    if load >= cfg["stress"]["lock_new_tools"]:
        return "warn"
    return "ok"


def render(root: Path, cfg: dict) -> str:
    store = Store(root)
    reg = Registry(root)
    meta = store.get("meta", {})
    stress = store.get("stress", {})
    names = store.get("names", {})
    budget = store.get("budget", {})
    prs = store.get("prs", {})
    history = store.get("history", [])
    by_agent = {v: k for k, v in names.items()}
    e = html.escape

    rows = []
    for agent in cfg["agents"]:
        load = round(min(1.0, sum(stress.get(agent, {}).get("stressors", {}).values())), 2)
        c = _cls(load, cfg)
        used = budget.get("agents", {}).get(agent, 0)
        locks = []
        if load >= cfg["stress"]["lock_new_tools"]:
            locks.append("new tools")
        if load >= cfg["stress"]["lock_writes"]:
            locks.append("writes")
        rows.append(f"<tr><td><b>{e(by_agent.get(agent, '?'))}</b> <span class=sub>{e(agent)}</span></td>"
                    f"<td><div class=bar><i style='width:{int(load*100)}%;background:var(--{c if c!='ok' else 'ok'})'></i></div></td>"
                    f"<td class={c}>{load:.2f}</td><td>{', '.join(locks) or '—'}</td>"
                    f"<td>{used:,} / {cfg['budget']['tokens_per_agent_per_day']:,}</td></tr>")

    tools = []
    for name, t in sorted(reg.tools.items()):
        c = {"green": "ok", "red": "bad"}.get(t.get("status"), "warn")
        tools.append(f"<tr><td><code>{e(name)}</code></td><td class={c}>{e(str(t.get('status')))}</td>"
                     f"<td>{e(str(t.get('author')))}</td><td>{t.get('cycles_survived', 0)}</td>"
                     f"<td>{e(', '.join(t.get('used_by', [])) or '—')}</td></tr>")

    pr_rows = [f"<tr><td>#{e(n)}</td><td>{e(p['agent'])}</td><td><code>{e(p['tool'])}</code></td>"
               f"<td>{p.get('opened_cycle', '?')}</td></tr>" for n, p in sorted(prs.items())]

    hist = []
    for h in reversed(history[-12:]):
        outs = "; ".join(f"{o['agent']}: {o['action']} {o.get('tool') or ''}".strip()
                         for o in h.get("outcomes", [])) or "—"
        hist.append(f"<tr><td>{h['cycle']}</td><td class=sub>{e(h.get('at', ''))}</td><td>{e(outs)}</td></tr>")

    def table(head: list[str], body: list[str], empty: str) -> str:
        if not body:
            return f"<p class=sub>{e(empty)}</p>"
        return ("<table><thead><tr>" + "".join(f"<th>{h}</th>" for h in head) +
                "</tr></thead><tbody>" + "".join(body) + "</tbody></table>")

    return f"""<!doctype html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>Hollow</title><style>{CSS}</style></head>
<body><main>
<h1>Hollow</h1>
<p class=sub>cycle {meta.get('cycle', 0)} · last run {e(str(meta.get('last_run', 'never')))} · budget day {e(str(budget.get('day', '—')))}</p>
<h2>Agents</h2>{table(['Agent', 'Stress', 'Load', 'Locked', 'Tokens today'], rows, 'no agents')}
<h2>Registry</h2>{table(['Tool', 'Status', 'Author', 'Survived', 'Used by'], tools, 'no tools merged yet')}
<h2>Open pull requests</h2>{table(['PR', 'Agent', 'Tool', 'Opened cycle'], pr_rows, 'none in flight')}
<h2>Recent cycles</h2>{table(['Cycle', 'At', 'Outcomes'], hist, 'no cycles yet')}
<h2>Last events</h2><ul>{''.join(f'<li>{e(x)}</li>' for x in meta.get('last_events', [])[-15:]) or '<li class=sub>—</li>'}</ul>
</main></body></html>
"""


def write(root: Path, cfg: dict, out: Path | None = None) -> Path:
    out = out or root / "site" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(root, cfg))
    return out
