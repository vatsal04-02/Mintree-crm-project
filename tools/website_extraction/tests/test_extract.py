"""Offline tests for extract.py. No test touches the network.

Fixtures are INVENTED test data in the shape of a Shopify storefront and of schema.org JSON-LD
pages. They are not Mintree products, prices or SKUs.

Run: python -m unittest discover -s tools/website_extraction/tests -v
"""

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract  # noqa: E402

BASE = "https://shop.example.test/"
FIX = Path(__file__).parent / "fixtures"


def seed(cache: Path, url: str, status: int, body):
	"""Put a response into the fetcher cache, exactly as a live run would."""
	f = extract.Fetcher.__new__(extract.Fetcher)
	f.cache = cache
	if isinstance(body, dict | list):
		body = json.dumps(body)
	if isinstance(body, Path):
		body = body.read_text()
	path = f._path(url)
	cache.mkdir(parents=True, exist_ok=True)
	path.write_text(json.dumps({"url": url, "status": status, "body": body.encode().decode("latin-1") if body is not None else None}))


def run(cache: Path, out: Path):
	fetcher = extract.Fetcher(BASE, cache, delay=0, offline=True)
	products, problems, meta = extract.extract(BASE, fetcher)
	extract.write_outputs(out, products, problems, meta)
	return products, problems, meta


def rows(path: Path):
	with open(path, newline="", encoding="utf-8") as f:
		return list(csv.DictReader(f))


class ShopifyStorefront(unittest.TestCase):
	def setUp(self):
		self.tmp = Path(tempfile.mkdtemp())
		self.cache = self.tmp / "cache"
		shop = json.loads((FIX / "shopify_products.json").read_text())
		seed(self.cache, BASE + "robots.txt", 200, "User-agent: *\nDisallow: /checkout\nDisallow: /account\n")
		seed(self.cache, BASE, 200, '<script>Shopify.currency = {"active":"INR","rate":"1.0"};</script>')
		pages = shop["pages"]
		for i, page in enumerate(pages, 1):
			seed(self.cache, BASE + f"products.json?limit=250&page={i}", 200, {"products": page})
		seed(self.cache, BASE + f"products.json?limit=250&page={len(pages) + 1}", 200, {"products": []})
		seed(self.cache, BASE + "collections.json?limit=250&page=1", 200, {"collections": shop["collections"]})
		seed(self.cache, BASE + "collections.json?limit=250&page=2", 200, {"collections": []})
		for handle, members in shop["collection_members"].items():
			url = BASE + f"collections/{handle}/products.json?limit=250&page="
			seed(self.cache, url + "1", 200, {"products": [{"id": 0, "handle": h} for h in members]})
			seed(self.cache, url + "2", 200, {"products": []})
		self.products, self.problems, self.meta = run(self.cache, self.tmp / "out")

	def test_all_pages_read_and_duplicates_dropped(self):
		self.assertEqual(self.meta["method"], "shopify-json")
		self.assertEqual(sorted(p.handle for p in self.products), ["test-face-wash", "test-gift-set", "test-hair-oil"])

	def test_variants_are_separate_sellable_rows(self):
		v = rows(self.tmp / "out" / "product_variants.csv")
		self.assertEqual(len(v), 4)  # 2 sizes of the face wash, 1 hair oil, 1 gift set
		wash = [r for r in v if r["product_handle"] == "test-face-wash"]
		self.assertEqual({r["pack_size_value"] + r["pack_size_unit"] for r in wash}, {"100ml", "200ml"})
		self.assertTrue(all("?variant=" in r["url"] for r in wash))

	def test_prices_mrp_currency_and_availability_kept_as_published(self):
		v = {r["variant_id"]: r for r in rows(self.tmp / "out" / "product_variants.csv")}
		self.assertEqual((v["101"]["price"], v["101"]["compare_at_price"], v["101"]["currency"]), ("299.00", "349.00", "INR"))
		self.assertEqual(v["102"]["available_on_storefront"], "0")
		self.assertEqual(v["201"]["compare_at_price"], "")  # not published: left empty

	def test_missing_sku_is_reported_not_invented(self):
		v = {r["variant_id"]: r for r in rows(self.tmp / "out" / "product_variants.csv")}
		self.assertEqual(v["201"]["sku"], "")
		errors = rows(self.tmp / "out" / "extraction_errors.csv")
		self.assertTrue(any(e["handle"] == "test-hair-oil" and "sku not published" in e["detail"] for e in errors))
		self.assertTrue(any(e["kind"] == "duplicate" for e in errors))

	def test_collections_images_and_gift_set(self):
		by = {p.handle: p for p in self.products}
		self.assertEqual(by["test-face-wash"].collections, ["Face Care"])
		self.assertEqual(by["test-gift-set"].variants[0].pack_count, "3")
		imgs = rows(self.tmp / "out" / "product_images.csv")
		self.assertEqual(len(imgs), 3)
		self.assertEqual(imgs[0]["image_url"], "https://cdn.example.test/wash-front.jpg")

	def test_all_seven_outputs_written(self):
		names = {"products.json", "products.csv", "product_variants.csv", "product_images.csv", "extraction_errors.csv", "extraction_summary.md", "source_audit.md"}
		self.assertTrue(names <= {p.name for p in (self.tmp / "out").iterdir()})
		self.assertIn("| Sellable variants | 4 |", (self.tmp / "out" / "extraction_summary.md").read_text())

	def test_rerun_uses_cache_and_makes_no_requests(self):
		fetcher = extract.Fetcher(BASE, self.cache, delay=0)  # online mode, but everything is cached
		with mock.patch("urllib.request.urlopen", side_effect=AssertionError("network used")):
			extract.extract(BASE, fetcher)
		self.assertEqual(fetcher.requests, 0)


class JsonLdSite(unittest.TestCase):
	def setUp(self):
		self.tmp = Path(tempfile.mkdtemp())
		cache = self.tmp / "cache"
		seed(cache, BASE + "robots.txt", 200, "User-agent: *\nDisallow: /products/private-item\n")
		seed(cache, BASE, 200, "<html></html>")
		seed(cache, BASE + "products.json?limit=250&page=1", 404, None)
		seed(cache, BASE + "sitemap.xml", 200, FIX / "sitemap_index.xml")
		seed(cache, BASE + "sitemap_products_1.xml", 200, FIX / "sitemap_products_1.xml")
		seed(cache, BASE + "products/test-body-lotion", 200, FIX / "product_jsonld.html")
		seed(cache, BASE + "products/broken-page", 200, "<html>no structured data</html>")
		seed(cache, BASE + "products/gone", 404, None)
		self.products, self.problems, self.meta = run(cache, self.tmp / "out")

	def test_falls_back_to_sitemap_and_json_ld(self):
		self.assertEqual(self.meta["method"], "sitemap+json-ld")
		self.assertEqual([p.handle for p in self.products], ["test-body-lotion"])
		p = self.products[0]
		self.assertEqual((p.currency, p.variants[0].price, p.variants[0].sku, p.variants[0].barcode), ("INR", "450.00", "TEST-BL-200", "0000000000000"))
		self.assertEqual((p.variants[0].pack_size_value, p.variants[0].pack_size_unit), ("200", "ml"))
		self.assertTrue(p.variants[0].available)

	def test_disallowed_failed_and_unparsable_pages_are_reported(self):
		kinds = {(e.handle, e.kind) for e in self.problems}
		self.assertIn(("private-item", "disallowed"), kinds)
		self.assertIn(("gone", "fetch_failed"), kinds)
		self.assertIn(("broken-page", "parse_failed"), kinds)


class Politeness(unittest.TestCase):
	def test_unreachable_robots_means_fetch_nothing(self):
		tmp = Path(tempfile.mkdtemp())
		with mock.patch("urllib.request.urlopen", side_effect=extract.urllib.error.URLError("down")), mock.patch("time.sleep"):
			f = extract.Fetcher(BASE, tmp, delay=0, retries=1)
		self.assertFalse(f.allowed(BASE + "products.json"))

	def test_retries_on_429_then_succeeds(self):
		tmp = Path(tempfile.mkdtemp())
		seed(tmp, BASE + "robots.txt", 404, None)
		f = extract.Fetcher(BASE, tmp, delay=0, retries=3)
		err = extract.urllib.error.HTTPError(BASE + "x", 429, "Too Many", {"Retry-After": "1"}, None)
		ok = mock.MagicMock()
		ok.__enter__.return_value.status = 200
		ok.__enter__.return_value.read.return_value = b"{}"
		with mock.patch("urllib.request.urlopen", side_effect=[err, ok]), mock.patch("time.sleep") as sleep:
			self.assertEqual(f.get(BASE + "x")[0], 200)
		sleep.assert_any_call(1.0)
		self.assertEqual(f.requests, 2)

	def test_404_is_not_retried(self):
		tmp = Path(tempfile.mkdtemp())
		seed(tmp, BASE + "robots.txt", 404, None)
		f = extract.Fetcher(BASE, tmp, delay=0, retries=3)
		err = extract.urllib.error.HTTPError(BASE + "y", 404, "Not Found", {}, None)
		with mock.patch("urllib.request.urlopen", side_effect=[err]) as m:
			self.assertEqual(f.get(BASE + "y")[0], 404)
		self.assertEqual(m.call_count, 1)

	def test_pack_parsing(self):
		self.assertEqual(extract.parse_pack("Rose Water Toner 100 ml"), ("100", "ml", ""))
		self.assertEqual(extract.parse_pack("Combo - pack of 2", "Soap 75g"), ("75", "g", "2"))
		self.assertEqual(extract.parse_pack("Default"), ("", "", ""))


if __name__ == "__main__":
	unittest.main()
