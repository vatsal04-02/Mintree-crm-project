"""Offline tests for to_erpnext.py, on the invented Shopify fixture (not Mintree data)."""

import csv
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import to_erpnext  # noqa: E402
import test_extract  # noqa: E402


def rows(path):
	with open(path, newline="", encoding="utf-8") as f:
		return list(csv.DictReader(f))


class Mapping(unittest.TestCase):
	def setUp(self):
		fx = test_extract.ShopifyStorefront("test_all_seven_outputs_written")
		fx.setUp()
		self.out = fx.tmp / "out"
		self.result = to_erpnext.convert(self.out)
		self.items = {r["item_code*"]: r for r in rows(self.out / "erpnext" / "items.csv")}
		self.sources = {r["item_code"]: r for r in rows(self.out / "erpnext" / "item_sources.csv")}

	def test_one_item_per_variant_published_sku_kept(self):
		self.assertEqual(set(self.items), {"TFW-100", "TFW-200", "WEB-TEST-HAIR-OIL", "TGS-3"})
		self.assertEqual(self.sources["TFW-100"]["code_generated"], "0")
		self.assertEqual(self.sources["WEB-TEST-HAIR-OIL"]["code_generated"], "1")

	def test_names_pack_size_and_template_columns(self):
		self.assertEqual(self.items["TFW-200"]["item_name*"], "Test Face Wash - 200 ml")
		self.assertIn("Pack size: 200 ml", self.items["TFW-200"]["description"])
		self.assertEqual(self.items["TFW-200"]["stock_uom*"], "Nos")
		with open(to_erpnext.ITEM_TEMPLATE) as f:
			self.assertEqual(list(self.items["TFW-200"].keys()), next(csv.reader(f)))

	def test_categories_and_evidence(self):
		self.assertEqual(self.items["TFW-100"]["item_group*"], "Skin Care")
		self.assertEqual(self.items["WEB-TEST-HAIR-OIL"]["item_group*"], "Hair Care")
		self.assertEqual(self.items["TGS-3"]["item_group*"], "Gift Sets / Combos")
		self.assertIn("product_type", self.sources["TFW-100"]["category_evidence"])
		groups = rows(self.out / "erpnext" / "item_groups.csv")
		self.assertTrue(all(g["parent_item_group"] == "FG" for g in groups))

	def test_mrp_and_selling_price_kept_apart(self):
		prices = [(p["item_code*"], p["price_list*"], p["rate*"]) for p in rows(self.out / "erpnext" / "item_prices.csv")]
		self.assertIn(("TFW-100", "Standard Selling", "299.00"), prices)
		self.assertIn(("TFW-100", "MRP", "349.00"), prices)
		self.assertNotIn("MRP", [pl for code, pl, _ in prices if code == "WEB-TEST-HAIR-OIL"])

	def test_traceability_and_images(self):
		self.assertTrue(self.sources["TFW-100"]["source_url"].startswith("https://shop.example.test/products/test-face-wash"))
		self.assertEqual(self.sources["TFW-100"]["image_url"], "https://cdn.example.test/wash-front.jpg")
		self.assertEqual(self.sources["TFW-200"]["image_url"], "https://cdn.example.test/wash-front.jpg")  # product image
		self.assertEqual(self.sources["WEB-TEST-HAIR-OIL"]["image_url"], "")

	def test_missing_mrp_is_not_a_review_item_but_missing_price_would_be(self):
		review = rows(self.out / "erpnext" / "mapping_review.csv")
		self.assertEqual(review, [])


if __name__ == "__main__":
	unittest.main()
