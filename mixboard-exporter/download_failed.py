#!/usr/bin/env python3
"""Download the images listed in failed-urls.txt from a Mixboard export.

The browser is sometimes not allowed to re-download an image from another site (CORS).
Most Google image links work without logging in, so this fetches them directly.

    python3 download_failed.py path/to/mixboard-export.zip     # or the extracted folder / failed-urls.txt
"""
import pathlib
import sys
import urllib.request
import zipfile

EXT = {b"\x89PNG": "png", b"\xff\xd8\xff": "jpg", b"GIF8": "gif", b"RIFF": "webp"}


def read_urls(src: pathlib.Path) -> list[str]:
    if src.suffix == ".zip":
        with zipfile.ZipFile(src) as z:
            text = z.read("failed-urls.txt").decode()
    elif src.is_dir():
        text = (src / "failed-urls.txt").read_text()
    else:
        text = src.read_text()
    return [line.strip() for line in text.splitlines() if line.strip()]


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1])
    out = (src.parent if src.is_file() else src) / "recovered"
    out.mkdir(exist_ok=True)
    for i, url in enumerate(read_urls(src), 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:  # keep going; report what failed
            print(f"FAILED  {url}  ({e})")
            continue
        ext = next((v for k, v in EXT.items() if data.startswith(k)), "bin")
        path = out / f"{i:03d}.{ext}"
        path.write_bytes(data)
        print(f"saved   {path}")


if __name__ == "__main__":
    main()
