"""Extract the public product catalogue of a storefront (built for https://vmintree.in/).

Public data only. The script reads robots.txt and skips every disallowed URL, waits between
requests, retries transient failures with back-off, caches every response on disk (a re-run makes
no repeated requests unless ``--refresh``), and never logs in, solves a CAPTCHA or bypasses a block.

Discovery, in order:

1. **Shopify storefront JSON** (``/products.json?limit=250&page=N``, ``/collections.json`` and
   ``/collections/<handle>/products.json``), when the site serves it. Paginated until an empty page.
2. **Sitemap + product pages** otherwise: ``sitemap.xml`` (sitemap indexes followed), product URLs,
   and each page's schema.org ``Product`` JSON-LD.

Nothing is invented. A field the site does not publish stays empty and is listed in
``extraction_errors.csv``. Storefront availability is recorded as displayed; it is **not** factory
inventory.

Usage:
    python tools/website_extraction/extract.py https://vmintree.in/ data/mintree_website_extraction
    python tools/website_extraction/extract.py --offline <cache dir> ...   (re-build outputs from cache)
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from html import unescape
from pathlib import Path

USER_AGENT = "MintreeFactoryOS-CatalogueExtract/1.0 (one-off public catalogue read for the brand owner's ERP demo)"
log = logging.getLogger("extract")

PACK_RE = re.compile(
	r"(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>ml|mL|ML|l|L|ltr|litre|g|gm|gms|G|kg|Kg|KG|pcs|pc|N|nos)\b"
)
PACK_OF_RE = re.compile(r"\b(?:pack|set|combo)\s+of\s+(?P<count>\d+)\b", re.I)
UNIT_NORMAL = {
	"ml": "ml", "l": "l", "ltr": "l", "litre": "l", "g": "g", "gm": "g", "gms": "g", "kg": "kg",
	"pcs": "pcs", "pc": "pcs", "n": "pcs", "nos": "pcs",
}  # fmt: skip


# --------------------------------------------------------------------------- data model
@dataclass
class Variant:
	variant_id: str
	title: str
	option_values: list[str]
	sku: str = ""
	barcode: str = ""
	price: str = ""
	compare_at_price: str = ""
	available: bool | None = None
	pack_size_value: str = ""
	pack_size_unit: str = ""
	pack_count: str = ""
	grams: str = ""


@dataclass
class Product:
	product_id: str
	handle: str
	title: str
	url: str
	product_type: str = ""
	vendor: str = ""
	tags: list[str] = field(default_factory=list)
	collections: list[str] = field(default_factory=list)
	description_html: str = ""
	description_text: str = ""
	option_names: list[str] = field(default_factory=list)
	currency: str = ""
	images: list[dict] = field(default_factory=list)  # {"src", "position", "alt", "variant_ids"}
	variants: list[Variant] = field(default_factory=list)
	source: str = ""  # "shopify-json" or "json-ld"
	extracted_at: str = ""


@dataclass
class Problem:
	url: str
	handle: str
	kind: str  # fetch_failed, disallowed, missing_field, parse_failed
	detail: str


# --------------------------------------------------------------------------- fetching
class Fetcher:
	"""Polite HTTP GET with robots.txt, throttling, retries and an on-disk cache."""

	def __init__(self, base: str, cache: Path, delay: float = 1.5, retries: int = 3, refresh=False, offline=False):
		self.base = base.rstrip("/") + "/"
		self.cache = cache
		self.cache.mkdir(parents=True, exist_ok=True)
		self.delay, self.retries, self.refresh, self.offline = delay, retries, refresh, offline
		self._last = 0.0
		self.requests = 0
		self.robots = urllib.robotparser.RobotFileParser()
		self._load_robots()

	def _load_robots(self):
		status, body = self.get(urllib.parse.urljoin(self.base, "robots.txt"), check_robots=False)
		if status == 200 and body is not None:
			self.robots.parse(body.decode("utf-8", "replace").splitlines())
			crawl = self.robots.crawl_delay(USER_AGENT)
			if crawl:
				self.delay = max(self.delay, float(crawl))
		elif 400 <= status < 500:  # no robots.txt: everything public is allowed (RFC 9309 §2.3.1.3)
			self.robots.parse([])
		else:  # unreachable or server error: assume complete disallow (RFC 9309 §2.3.1.4)
			log.warning("robots.txt unreachable (status %s): nothing will be fetched", status)
			self.robots.parse(["User-agent: *", "Disallow: /"])
		self.robots_status = status

	def allowed(self, url: str) -> bool:
		return self.robots.can_fetch(USER_AGENT, url)

	def _path(self, url: str) -> Path:
		return self.cache / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".json")

	def get(self, url: str, check_robots: bool = True) -> tuple[int, bytes | None]:
		"""(status, body). Status 0 = not fetched (disallowed or network failure)."""
		if check_robots and not self.allowed(url):
			return -1, None
		path = self._path(url)
		if path.exists() and not self.refresh:
			rec = json.loads(path.read_text())
			return rec["status"], rec["body"].encode("latin-1") if rec["body"] is not None else None
		if self.offline:
			return 0, None
		status, body = 0, None
		for attempt in range(self.retries + 1):
			wait = self.delay - (time.monotonic() - self._last)
			if wait > 0:
				time.sleep(wait)
			self._last = time.monotonic()
			self.requests += 1
			try:
				req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
				with urllib.request.urlopen(req, timeout=30) as r:
					status, body = r.status, r.read()
				break
			except urllib.error.HTTPError as e:
				status, body = e.code, None
				if e.code in (429, 500, 502, 503, 504) and attempt < self.retries:
					retry_after = e.headers.get("Retry-After")
					time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else 2 ** (attempt + 1))
					continue
				break  # 4xx other than 429: final, never retried
			except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
				log.warning("network error %s (attempt %d): %s", url, attempt + 1, e)
				status, body = 0, None
				if attempt < self.retries:
					time.sleep(2 ** (attempt + 1))
		log.info("GET %s -> %s", url, status)
		if status:  # cache real answers (incl. 404) so a re-run does not repeat them
			path.write_text(json.dumps({"url": url, "status": status, "body": body.decode("latin-1") if body is not None else None}))
		return status, body

	def get_json(self, url: str):
		status, body = self.get(url)
		if status != 200 or body is None:
			return status, None
		try:
			return status, json.loads(body)
		except ValueError:
			return status, None


# --------------------------------------------------------------------------- parsing helpers
def html_to_text(html: str) -> str:
	text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html or "")
	text = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</h\d>", "\n", text)
	text = re.sub(r"<[^>]+>", " ", text)
	text = unescape(text)
	return "\n".join(" ".join(line.split()) for line in text.splitlines() if line.strip())


def parse_pack(*texts: str) -> tuple[str, str, str]:
	"""(value, unit, pack count) from variant / product titles; empty when not stated."""
	value = unit = count = ""
	for t in texts:
		if not t:
			continue
		if not value and (m := PACK_RE.search(t)):
			value, unit = m.group("value"), UNIT_NORMAL[m.group("unit").lower()]
		if not count and (m := PACK_OF_RE.search(t)):
			count = m.group("count")
	return value, unit, count


def clean_price(value) -> str:
	"""Shopify JSON prices are strings in major units ("349.00"); keep as published, normalised."""
	if value in (None, ""):
		return ""
	try:
		return f"{float(str(value).replace(',', '')):.2f}"
	except ValueError:
		return ""


def find_currency(html: str) -> str:
	for pattern in (
		r'Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"',
		r'property="og:price:currency"\s+content="([A-Z]{3})"',
		r'"priceCurrency"\s*:\s*"([A-Z]{3})"',
	):
		if m := re.search(pattern, html or ""):
			return m.group(1)
	return ""


def json_ld_blocks(html: str) -> list:
	out = []
	for raw in re.findall(r'(?is)<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', html or ""):
		try:
			data = json.loads(raw.strip())
		except ValueError:
			continue
		items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
		out.extend(i for i in items if isinstance(i, dict))
	return out


# --------------------------------------------------------------------------- extractors
def product_from_shopify(p: dict, base: str, currency: str, now: str) -> Product:
	options = [o.get("name", "") for o in p.get("options") or []]
	prod = Product(
		product_id=str(p.get("id", "")),
		handle=p.get("handle", ""),
		title=(p.get("title") or "").strip(),
		url=urllib.parse.urljoin(base, f"products/{p.get('handle', '')}"),
		product_type=p.get("product_type") or "",
		vendor=p.get("vendor") or "",
		tags=sorted(t.strip() for t in (p.get("tags") if isinstance(p.get("tags"), list) else (p.get("tags") or "").split(",")) if t.strip()),
		description_html=p.get("body_html") or "",
		description_text=html_to_text(p.get("body_html") or ""),
		option_names=options,
		currency=currency,
		source="shopify-json",
		extracted_at=now,
	)
	for img in p.get("images") or []:
		prod.images.append(
			{"src": img.get("src", ""), "position": img.get("position"), "alt": img.get("alt") or "", "variant_ids": [str(v) for v in img.get("variant_ids") or []]}
		)
	for v in p.get("variants") or []:
		values = [v.get(f"option{i}") for i in (1, 2, 3) if v.get(f"option{i}")]
		vtitle = v.get("title") or ""
		value, unit, count = parse_pack(vtitle if vtitle != "Default Title" else "", prod.title)
		prod.variants.append(
			Variant(
				variant_id=str(v.get("id", "")),
				title=vtitle,
				option_values=[x for x in values if x != "Default Title"],
				sku=(v.get("sku") or "").strip(),
				barcode=(v.get("barcode") or "").strip(),
				price=clean_price(v.get("price")),
				compare_at_price=clean_price(v.get("compare_at_price")),
				available=v.get("available"),
				pack_size_value=value,
				pack_size_unit=unit,
				pack_count=count,
				grams=str(v.get("grams") or ""),
			)
		)
	return prod


def product_from_json_ld(url: str, html: str, now: str) -> Product | None:
	node = next((b for b in json_ld_blocks(html) if b.get("@type") in ("Product", "ProductGroup")), None)
	if not node:
		return None
	handle = urllib.parse.urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
	images = node.get("image") or []
	images = [images] if isinstance(images, str | dict) else images
	prod = Product(
		product_id=str(node.get("productID") or node.get("sku") or ""),
		handle=handle,
		title=(node.get("name") or "").strip(),
		url=url,
		product_type=node.get("category") or "",
		vendor=(node.get("brand") or {}).get("name", "") if isinstance(node.get("brand"), dict) else node.get("brand") or "",
		description_text=html_to_text(node.get("description") or ""),
		description_html=node.get("description") or "",
		currency=find_currency(html),
		source="json-ld",
		extracted_at=now,
	)
	for i, img in enumerate(images, 1):
		src = img.get("url") if isinstance(img, dict) else img
		if src:
			prod.images.append({"src": src, "position": i, "alt": "", "variant_ids": []})
	offers = node.get("hasVariant") or []
	if offers:  # ProductGroup with variants
		entries = [(v.get("name", ""), v.get("sku", ""), v.get("gtin13") or v.get("gtin") or "", v.get("offers") or {}) for v in offers]
	else:
		o = node.get("offers") or {}
		o = o if isinstance(o, list) else [o]
		entries = [(x.get("name", ""), x.get("sku", "") or node.get("sku", ""), x.get("gtin13") or node.get("gtin13") or "", x) for x in o]
	for idx, (name, sku, gtin, offer) in enumerate(entries, 1):
		offer = offer[0] if isinstance(offer, list) else offer
		value, unit, count = parse_pack(name, prod.title)
		availability = (offer.get("availability") or "").rsplit("/", 1)[-1]
		prod.variants.append(
			Variant(
				variant_id=str(offer.get("@id") or f"{handle}-{idx}"),
				title=name,
				option_values=[name] if name and name != prod.title else [],
				sku=sku or "",
				barcode=gtin,
				price=clean_price(offer.get("price")),
				compare_at_price="",  # JSON-LD carries no MRP / compare-at price
				available={"InStock": True, "OutOfStock": False}.get(availability),
				pack_size_value=value,
				pack_size_unit=unit,
				pack_count=count,
			)
		)
		prod.currency = prod.currency or offer.get("priceCurrency", "")
	return prod


def sitemap_product_urls(fetcher: Fetcher, url: str, seen: set | None = None) -> list[str]:
	seen = seen if seen is not None else set()
	if url in seen:
		return []
	seen.add(url)
	status, body = fetcher.get(url)
	if status != 200 or not body:
		return []
	try:
		root = ET.fromstring(body)
	except ET.ParseError:
		return []
	ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
	urls = []
	for loc in root.findall("s:sitemap/s:loc", ns):
		urls += sitemap_product_urls(fetcher, loc.text.strip(), seen)
	for loc in root.findall("s:url/s:loc", ns):
		if "/products/" in loc.text:
			urls.append(loc.text.strip())
	return list(dict.fromkeys(urls))


# --------------------------------------------------------------------------- run
def paged(fetcher: Fetcher, url_fmt: str, key: str, max_pages: int = 50) -> tuple[list, bool]:
	"""All items of a paginated Shopify endpoint; (items, endpoint worked)."""
	items, seen_ids = [], set()
	for page in range(1, max_pages + 1):
		status, data = fetcher.get_json(url_fmt.format(page=page))
		if status != 200 or not isinstance(data, dict) or key not in data:
			return items, page > 1
		new_ids = {x.get("id") for x in data[key]} - seen_ids
		if not new_ids:  # empty page, or a server that ignores ?page= and repeats itself
			break
		seen_ids |= new_ids
		items += data[key]  # repeats are kept so the caller can report them as duplicates
	return items, True


def extract(base: str, fetcher: Fetcher) -> tuple[list[Product], list[Problem], dict]:
	now = datetime.now(UTC).isoformat(timespec="seconds")
	problems: list[Problem] = []
	meta = {"base_url": base, "started_at": now, "method": "", "robots_txt_status": fetcher.robots_status}
	_, home = fetcher.get(base)
	currency = find_currency(home.decode("utf-8", "replace") if home else "")
	products: dict[str, Product] = {}

	raw, ok = paged(fetcher, urllib.parse.urljoin(base, "products.json?limit=250&page={page}"), "products")
	if ok and raw:
		meta["method"] = "shopify-json"
		for p in raw:
			prod = product_from_shopify(p, base, currency, now)
			if prod.handle in products:
				problems.append(Problem(prod.url, prod.handle, "duplicate", "same handle listed twice; first kept"))
				continue
			products[prod.handle] = prod
		cols, _ = paged(fetcher, urllib.parse.urljoin(base, "collections.json?limit=250&page={page}"), "collections")
		for c in cols:
			members, _ = paged(
				fetcher, urllib.parse.urljoin(base, f"collections/{c['handle']}/products.json?limit=250&page={{page}}"), "products"
			)
			for p in members:
				if p.get("handle") in products:
					products[p["handle"]].collections.append(c.get("title") or c["handle"])
	else:
		meta["method"] = "sitemap+json-ld"
		for url in sitemap_product_urls(fetcher, urllib.parse.urljoin(base, "sitemap.xml")):
			status, body = fetcher.get(url)
			handle = urllib.parse.urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
			if status == -1:
				problems.append(Problem(url, handle, "disallowed", "robots.txt disallows this URL; not fetched"))
				continue
			if status != 200 or not body:
				problems.append(Problem(url, handle, "fetch_failed", f"HTTP {status}"))
				continue
			prod = product_from_json_ld(url, body.decode("utf-8", "replace"), now)
			if not prod:
				problems.append(Problem(url, handle, "parse_failed", "no schema.org Product data on the page"))
				continue
			if prod.handle in products:
				problems.append(Problem(url, handle, "duplicate", "same handle listed twice; first kept"))
				continue
			products[prod.handle] = prod

	for prod in products.values():
		prod.collections = sorted(set(prod.collections))
		for fname in ("title", "currency"):
			if not getattr(prod, fname):
				problems.append(Problem(prod.url, prod.handle, "missing_field", f"{fname} not published"))
		if not prod.images:
			problems.append(Problem(prod.url, prod.handle, "missing_field", "no public image"))
		for v in prod.variants:
			for fname in ("sku", "price", "compare_at_price"):
				if not getattr(v, fname):
					problems.append(Problem(prod.url, prod.handle, "missing_field", f"variant {v.variant_id}: {fname} not published"))
	meta["finished_at"] = datetime.now(UTC).isoformat(timespec="seconds")
	meta["http_requests"] = fetcher.requests
	return list(products.values()), problems, meta


def write_outputs(out: Path, products: list[Product], problems: list[Problem], meta: dict):
	out.mkdir(parents=True, exist_ok=True)
	(out / "products.json").write_text(
		json.dumps({"meta": meta, "products": [asdict(p) for p in products]}, indent=2, ensure_ascii=False)
	)

	def write(name, header, rows):
		with open(out / name, "w", newline="", encoding="utf-8") as f:
			w = csv.writer(f)
			w.writerow(header)
			w.writerows(rows)

	write(
		"products.csv",
		["product_id", "handle", "title", "product_type", "vendor", "collections", "tags", "variant_count", "image_count", "currency", "url", "description_text", "extracted_at"],
		[[p.product_id, p.handle, p.title, p.product_type, p.vendor, "|".join(p.collections), "|".join(p.tags), len(p.variants), len(p.images), p.currency, p.url, p.description_text, p.extracted_at] for p in products],
	)
	write(
		"product_variants.csv",
		["product_handle", "product_title", "variant_id", "variant_title", "option_values", "sku", "barcode", "price", "compare_at_price", "currency", "available_on_storefront", "pack_size_value", "pack_size_unit", "pack_count", "product_type", "collections", "url", "extracted_at"],
		[
			[p.handle, p.title, v.variant_id, v.title, "|".join(v.option_values), v.sku, v.barcode, v.price, v.compare_at_price, p.currency,
			 "" if v.available is None else int(v.available), v.pack_size_value, v.pack_size_unit, v.pack_count, p.product_type, "|".join(p.collections),
			 p.url + (f"?variant={v.variant_id}" if len(p.variants) > 1 else ""), p.extracted_at]
			for p in products for v in p.variants
		],
	)  # fmt: skip
	write(
		"product_images.csv",
		["product_handle", "product_title", "position", "image_url", "alt_text", "variant_ids"],
		[[p.handle, p.title, i.get("position"), i["src"], i.get("alt", ""), "|".join(i.get("variant_ids") or [])] for p in products for i in p.images],
	)
	write("extraction_errors.csv", ["url", "handle", "kind", "detail"], [[e.url, e.handle, e.kind, e.detail] for e in problems])

	variants = [v for p in products for v in p.variants]
	cats = sorted({p.product_type for p in products if p.product_type})
	cols = sorted({c for p in products for c in p.collections})
	kinds: dict[str, int] = {}
	for e in problems:
		kinds[e.kind] = kinds.get(e.kind, 0) + 1
	(out / "extraction_summary.md").write_text(
		"\n".join(
			[
				"# Website extraction summary",
				"",
				f"Source: {meta['base_url']} (public storefront only). Method: {meta['method'] or 'none'}.",
				f"Run: {meta['started_at']} to {meta.get('finished_at', '')} UTC, {meta.get('http_requests', 0)} HTTP requests.",
				"",
				"Storefront availability is what the shop displayed, **not factory inventory**. Prices are the",
				"public selling prices on that date. Missing fields were left empty, never filled in.",
				"",
				"| Measure | Count |",
				"| --- | ---: |",
				f"| Products | {len(products)} |",
				f"| Sellable variants | {len(variants)} |",
				f"| Variants with a published SKU | {sum(1 for v in variants if v.sku)} |",
				f"| Variants with a barcode | {sum(1 for v in variants if v.barcode)} |",
				f"| Variants with a compare-at price (MRP) | {sum(1 for v in variants if v.compare_at_price)} |",
				f"| Variants with a parsed pack size | {sum(1 for v in variants if v.pack_size_value)} |",
				f"| Product images | {sum(len(p.images) for p in products)} |",
				f"| Product types | {len(cats)} |",
				f"| Collections | {len(cols)} |",
				f"| Problems recorded | {len(problems)} |",
				"",
				"**Product types:** " + (", ".join(cats) or "none published"),
				"",
				"**Collections:** " + (", ".join(cols) or "none published"),
				"",
				"**Problems by kind:** " + (", ".join(f"{k} {n}" for k, n in sorted(kinds.items())) or "none"),
				"",
			]
		)
	)
	(out / "source_audit.md").write_text(
		"\n".join(
			[
				"# Source audit",
				"",
				f"- Site: {meta['base_url']}",
				f"- robots.txt HTTP status: {meta['robots_txt_status']} (obeyed; 0 = unreachable, so nothing fetched);"
				f" user agent: `{USER_AGENT}`",
				f"- Method: {meta['method'] or 'none'}",
				"- Endpoints used: `products.json` / `collections.json` / `collections/<handle>/products.json`"
				" (Shopify storefront JSON, paginated) when served; otherwise `sitemap.xml` and product pages"
				" (schema.org JSON-LD).",
				"- Only public pages; no login, cart, checkout, account or admin URLs; no CAPTCHA or rate-limit bypass.",
				f"- Requests: {meta.get('http_requests', 0)}, at least the configured delay apart; every response cached in"
				" the cache folder so a re-run repeats none.",
				f"- Timestamps (UTC): {meta['started_at']} to {meta.get('finished_at', '')}",
				"- Images are referenced by their public URL; downloading them for a local demo is a separate,"
				" opt-in step (`fetch_images.py`).",
				"",
				"This is public storefront information. It is **not** Mintree's internal ERP data: no SKU, price,",
				"pack size or category here was supplied or confirmed by Mintree.",
				"",
				"## Product URLs",
				"",
				*[f"- {p.url}" for p in products],
				"",
			]
		)
	)


def main(argv=None):
	ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
	ap.add_argument("base_url")
	ap.add_argument("out_dir")
	ap.add_argument("--cache", default=None, help="response cache (default: <out_dir>/.cache)")
	ap.add_argument("--delay", type=float, default=1.5, help="seconds between requests (raised to robots Crawl-delay)")
	ap.add_argument("--refresh", action="store_true", help="ignore the cache and fetch again")
	ap.add_argument("--offline", action="store_true", help="use only the cache; no network")
	args = ap.parse_args(argv)
	out = Path(args.out_dir)
	out.mkdir(parents=True, exist_ok=True)
	logging.basicConfig(
		level=logging.INFO,
		format="%(asctime)s %(levelname)s %(message)s",
		handlers=[logging.StreamHandler(), logging.FileHandler(out / "extraction.log")],
	)
	base = args.base_url.rstrip("/") + "/"
	fetcher = Fetcher(base, Path(args.cache) if args.cache else out / ".cache", args.delay, refresh=args.refresh, offline=args.offline)
	products, problems, meta = extract(base, fetcher)
	write_outputs(out, products, problems, meta)
	log.info("%d products, %d variants, %d problems", len(products), sum(len(p.variants) for p in products), len(problems))
	return 0 if products else 2


if __name__ == "__main__":
	raise SystemExit(main())
