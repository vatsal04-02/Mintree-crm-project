"""Download the public product images listed in erpnext/item_sources.csv, for the local demo only.

Images are the brand's content: they are saved under ``<extraction>/images/`` (git-ignored), never
committed or published. Each image host's robots.txt is obeyed, requests are throttled, an image
already on disk is not downloaded again, and failures are listed in ``images/failures.csv``.

Usage: python tools/website_extraction/fetch_images.py data/mintree_website_extraction
"""

from __future__ import annotations

import csv
import hashlib
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract import Fetcher  # noqa: E402

IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def local_name(url: str) -> str:
	path = urllib.parse.urlparse(url).path
	ext = Path(path).suffix.lower()
	ext = ext if ext in IMAGE_TYPES else ".jpg"
	return hashlib.sha256(url.encode()).hexdigest()[:20] + ext


def fetch_images(extraction: Path, delay: float = 1.0) -> dict:
	out = extraction / "images"
	out.mkdir(exist_ok=True)
	with open(extraction / "erpnext" / "item_sources.csv", newline="", encoding="utf-8") as f:
		urls = list(dict.fromkeys(r["image_url"] for r in csv.DictReader(f) if r.get("image_url")))
	fetchers: dict[str, Fetcher] = {}
	ok, failed = 0, []
	for url in urls:
		target = out / local_name(url)
		if target.exists():
			ok += 1
			continue
		host = "{0.scheme}://{0.netloc}/".format(urllib.parse.urlparse(url))
		if host not in fetchers:
			fetchers[host] = Fetcher(host, extraction / ".cache" / "images", delay=delay)
		status, body = fetchers[host].get(url)
		if status == 200 and body:
			target.write_bytes(body)
			ok += 1
		else:
			failed.append((url, "disallowed by robots.txt" if status == -1 else f"HTTP {status}"))
	with open(out / "failures.csv", "w", newline="", encoding="utf-8") as f:
		w = csv.writer(f)
		w.writerow(["image_url", "reason"])
		w.writerows(failed)
	return {"images": len(urls), "saved": ok, "failed": len(failed)}


if __name__ == "__main__":
	print(fetch_images(Path(sys.argv[1])))
