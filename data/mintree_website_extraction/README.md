# Mintree public website extraction

**Status (2026-11-05): not yet run.** The development environment's network policy refused
connections to `vmintree.in` (proxy `403` on CONNECT; the separate web-fetch tool could not resolve
the name either). No product data has been collected. Nothing in this folder is Mintree data until
the extractor is run against the live site.

When the site is reachable, run from the repository root:

```bash
python3 tools/website_extraction/extract.py https://vmintree.in/ data/mintree_website_extraction
```

```bash
python3 tools/website_extraction/to_erpnext.py data/mintree_website_extraction
```

That writes `products.json`, `products.csv`, `product_variants.csv`, `product_images.csv`,
`extraction_errors.csv`, `extraction_summary.md` and `source_audit.md` here, and the ERPNext
import files in `erpnext/`. The raw response cache (`.cache/`), the log and any downloaded images
(`images/`) stay local and are git-ignored.

See `docs/DEMO_GUIDE.md` for loading the result into the local demo site.
