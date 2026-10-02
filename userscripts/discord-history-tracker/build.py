#!/usr/bin/env python3
"""Builds discord-history-tracker.user.js from the files in src/.

Mirrors how the desktop app assembles its tracking script (GetTrackingScriptEndpoint.cs):
the scripts are joined with webpack.js first, the CSS is inlined into gui.js, and the result
is placed inside the userscript's launcher.
"""

from pathlib import Path

VERSION = "47.4.0"
UPSTREAM = "v47.4"

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUTPUT = ROOT / "discord-history-tracker.user.js"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def replace_once(text: str, placeholder: str, value: str) -> str:
    if text.count(placeholder) != 1:
        raise SystemExit(f"Expected exactly one {placeholder!r} placeholder")
    return text.replace(placeholder, value)


def css(name: str) -> str:
    contents = read(SRC / "styles" / name).strip()
    if "`" in contents or "${" in contents:
        raise SystemExit(f"{name} cannot contain backticks or template placeholders")
    return contents


def main() -> None:
    scripts = sorted((SRC / "scripts").glob("*.js"), key=lambda p: (p.name != "webpack.js", p.name))
    imports = "\n".join(read(path).rstrip() for path in scripts)

    imports = replace_once(imports, "/*[CSS-CONTROLLER]*/", css("controller.css"))
    imports = replace_once(imports, "/*[CSS-SETTINGS]*/", css("settings.css"))

    tracker = replace_once(read(SRC / "bootstrap.js"), "/*[IMPORTS]*/", imports).rstrip()

    userscript = read(SRC / "userscript.js")
    userscript = replace_once(userscript, "/*[VERSION]*/", VERSION)
    userscript = userscript.replace("/*[UPSTREAM]*/", UPSTREAM)
    userscript = replace_once(userscript, "/*[TRACKER]*/", tracker)

    OUTPUT.write_text(userscript, encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(userscript.encode('utf-8')):,} bytes)")


if __name__ == "__main__":
    main()
