"""Turn the extracted public catalogue into ERPNext import files (factory_ops Master Data Import).

Reads ``product_variants.csv`` and ``products.csv`` from an extraction folder and writes, into
``<extraction>/erpnext/``:

- ``item_groups.csv``: website category groups, all under FG (finished goods are QC-controlled);
- ``items.csv``: one Item per sellable variant, in the factory_ops "Items" template format;
- ``item_prices.csv``: selling price on "Standard Selling", compare-at price on "MRP" (kept apart);
- ``item_sources.csv``: item code -> source URL, published SKU / barcode, pack size, image URL,
  category rule that matched (for traceability and for the demo seeder);
- ``mapping_review.csv``: rows a person should look at (no category match, no price, long names).

Item codes:
- the variant's **published SKU** when the site discloses one;
- otherwise a generated code ``WEB-<handle>[-<pack>]``, upper-case. ``WEB-`` marks it as generated
  for this demo; it is never presented as a Mintree SKU.

Categories are inferred from the product type, collections, tags and title with the keyword rules
in ``category_rules.csv`` (editable). The matched rule is recorded per item; anything without a
match goes to "Uncategorised (review)".

``shelf_life_in_days`` is a **DEMO assumption** (the website publishes none); see DEMO_DATA.md.

Usage: python tools/website_extraction/to_erpnext.py data/mintree_website_extraction
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
FG_PARENT = "FG"
UNCATEGORISED = "Uncategorised (review)"
DEMO_SHELF_LIFE_DAYS = 730  # DEMO assumption, not published by the website
ITEM_TEMPLATE = Path(__file__).resolve().parents[2] / "apps/factory_ops/factory_ops/master_data/templates/items.csv"
PRICE_TEMPLATE = ITEM_TEMPLATE.with_name("item_prices.csv")
MAX_NAME = 140


def read(path: Path) -> list[dict]:
	with open(path, newline="", encoding="utf-8") as f:
		return list(csv.DictReader(f))


def header(template: Path) -> list[str]:
	with open(template, newline="", encoding="utf-8") as f:
		return next(csv.reader(f))


def load_rules(path: Path = HERE / "category_rules.csv") -> list[tuple[str, re.Pattern]]:
	return [(r["item_group"], re.compile(r["pattern"], re.I)) for r in read(path)]


def categorise(row: dict, product: dict, rules) -> tuple[str, str]:
	"""(item group, evidence). First rule wins; rules are ordered most specific first."""
	fields = [
		("product_type", row.get("product_type", "")),
		("collections", row.get("collections", "")),
		("tags", product.get("tags", "")),
		("title", row.get("product_title", "")),
	]
	for group, pattern in rules:
		for name, value in fields:
			if value and (m := pattern.search(value)):
				return group, f"{name} '{m.group(0)}' ~ /{pattern.pattern}/"
	return UNCATEGORISED, "no rule matched"


def code_for(row: dict, multi: bool) -> tuple[str, bool]:
	"""(item code, generated?)"""
	if row.get("sku"):
		return row["sku"].strip(), False
	parts = [row["product_handle"]]
	if multi:
		parts.append(row.get("variant_title") or row["variant_id"])
	code = "WEB-" + re.sub(r"[^A-Za-z0-9]+", "-", "-".join(parts)).strip("-").upper()
	return code[:140], True


def item_name(row: dict, multi: bool) -> str:
	title = row["product_title"].strip()
	vt = (row.get("variant_title") or "").strip()
	name = f"{title} - {vt}" if multi and vt and vt.lower() not in title.lower() else title
	return name[:MAX_NAME]


def convert(extraction: Path) -> dict:
	variants = read(extraction / "product_variants.csv")
	products = {p["handle"]: p for p in read(extraction / "products.csv")}
	images = {}
	if (extraction / "product_images.csv").exists():
		for img in read(extraction / "product_images.csv"):
			vids = [v for v in img.get("variant_ids", "").split("|") if v]
			for vid in vids:
				images.setdefault(("v", vid), img["image_url"])
			images.setdefault(("p", img["product_handle"]), img["image_url"])
	rules = load_rules()
	per_product: dict[str, int] = {}
	for v in variants:
		per_product[v["product_handle"]] = per_product.get(v["product_handle"], 0) + 1

	items, prices, sources, review, groups = [], [], [], [], set()
	seen_codes: dict[str, str] = {}
	for v in variants:
		multi = per_product[v["product_handle"]] > 1
		code, generated = code_for(v, multi)
		if code in seen_codes:
			review.append({"item_code": code, "issue": f"duplicate code (also {seen_codes[code]}); second row skipped", "url": v["url"]})
			continue
		seen_codes[code] = v["url"]
		product = products.get(v["product_handle"], {})
		group, evidence = categorise(v, product, rules)
		groups.add(group)
		name = item_name(v, multi)
		pack = " ".join(x for x in (v.get("pack_size_value"), v.get("pack_size_unit")) if x)
		desc = (product.get("description_text") or "").strip()
		description = "\n".join(
			x
			for x in (
				name,
				f"Pack size: {pack}" if pack else "",
				f"Pack of {v['pack_count']}" if v.get("pack_count") else "",
				f"Public catalogue item ({v['url']}), read {v['extracted_at']}.",
				desc[:2000],
			)
			if x
		)
		items.append(
			{
				"item_code": code,
				"item_name": name,
				"item_group": group,
				"stock_uom": "Nos",
				"description": description,
				"brand": product.get("vendor", ""),
				"has_expiry_date": 1,
				"shelf_life_in_days": DEMO_SHELF_LIFE_DAYS,
				"is_sales_item": 1,
				"is_purchase_item": 0,
			}
		)
		if v.get("price"):
			prices.append({"item_code": code, "price_list": "Standard Selling", "rate": v["price"]})
		else:
			review.append({"item_code": code, "issue": "no selling price published", "url": v["url"]})
		if v.get("compare_at_price"):
			prices.append({"item_code": code, "price_list": "MRP", "rate": v["compare_at_price"]})
		if group == UNCATEGORISED:
			review.append({"item_code": code, "issue": "category not matched by any rule", "url": v["url"]})
		if len(v["product_title"]) > MAX_NAME:
			review.append({"item_code": code, "issue": "name shortened to 140 characters", "url": v["url"]})
		sources.append(
			{
				"item_code": code,
				"code_generated": int(generated),
				"published_sku": v.get("sku", ""),
				"barcode": v.get("barcode", ""),
				"product_handle": v["product_handle"],
				"variant_id": v["variant_id"],
				"pack_size": pack,
				"pack_count": v.get("pack_count", ""),
				"currency": v.get("currency", ""),
				"selling_price": v.get("price", ""),
				"compare_at_price": v.get("compare_at_price", ""),
				"available_on_storefront": v.get("available_on_storefront", ""),
				"item_group": group,
				"category_evidence": evidence,
				"image_url": images.get(("v", v["variant_id"])) or images.get(("p", v["product_handle"]), ""),
				"source_url": v["url"],
				"extracted_at": v["extracted_at"],
			}
		)

	out = extraction / "erpnext"
	out.mkdir(exist_ok=True)

	def write(name, cols, rows):
		with open(out / name, "w", newline="", encoding="utf-8") as f:
			w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
			w.writeheader()
			w.writerows(rows)

	item_cols = header(ITEM_TEMPLATE)
	write("items.csv", item_cols, [{c: it.get(c.rstrip("*"), "") for c in item_cols} for it in items])
	price_cols = header(PRICE_TEMPLATE)
	write("item_prices.csv", price_cols, [{c: p.get(c.rstrip("*"), "") for c in price_cols} for p in prices])
	write("item_groups.csv", ["item_group", "parent_item_group"], [{"item_group": g, "parent_item_group": FG_PARENT} for g in sorted(groups)])
	write("item_sources.csv", list(sources[0].keys()) if sources else ["item_code"], sources)
	write("mapping_review.csv", ["item_code", "issue", "url"], review)
	return {"items": len(items), "prices": len(prices), "groups": sorted(groups), "review": len(review)}


if __name__ == "__main__":
	result = convert(Path(sys.argv[1]))
	print(result)
