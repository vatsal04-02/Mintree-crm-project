#!/usr/bin/env bash
# (Re)build the local Mintree demo site. Development machines only; nothing is deployed anywhere.
#
# Touches ONE site, demo.localhost (override with DEMO_SITE, which must end in .localhost). An existing
# demo site is dropped only if its site_config carries "fo_demo_site": 1, so this script can never drop
# factory.localhost, test.localhost or any real site. Application code is not touched.
#
#   deploy/demo/reset-demo.sh [extraction folder]   (default: data/mintree_website_extraction)
#
# Run as the bench user, from anywhere. Needs the dev services up (deploy/dev/compose.yaml).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BENCH_DIR="${BENCH_DIR:-$HOME/frappe-bench}"
SITE="${DEMO_SITE:-demo.localhost}"
DB_ROOT_PASSWORD="${DEV_DB_ROOT_PASSWORD:-dev-only-root}"
EXTRACTION="$(cd "${1:-$REPO/data/mintree_website_extraction}" 2>/dev/null && pwd || true)"

case "$SITE" in *.localhost) ;; *) echo "Refusing: demo site must be a *.localhost site"; exit 1 ;; esac
cd "$BENCH_DIR"

if [ -d "sites/$SITE" ]; then
  if ! grep -q '"fo_demo_site": 1' "sites/$SITE/site_config.json"; then
    echo "Refusing: sites/$SITE exists but is not marked as a demo site (fo_demo_site)."; exit 1
  fi
  bench drop-site "$SITE" --force --no-backup --db-root-username root --db-root-password "$DB_ROOT_PASSWORD"
fi

bench new-site "$SITE" --db-root-username root --db-root-password "$DB_ROOT_PASSWORD" \
  --admin-password "$(openssl rand -hex 12)" --install-app erpnext
bench --site "$SITE" install-app factory_ops
bench --site "$SITE" set-config -p fo_demo_site 1
bench --site "$SITE" set-config developer_mode 0
bench --site "$SITE" execute factory_ops.setup.sample_company.setup_dev_site
bench --site "$SITE" execute factory_ops.setup.sample_users.create_sample_users
bench --site "$SITE" execute factory_ops.demo.seed.seed_demo_site --kwargs "{\"extraction_dir\": \"${EXTRACTION}\"}"
echo
echo "Demo site ready: $SITE. Sample-user passwords: sites/$SITE/private/sample_users.json (mode 600)."
echo "Serve:     cd $BENCH_DIR/sites && ../env/bin/python -m frappe.utils.bench_helper frappe --site $SITE serve --port 8001 --noreload"
echo "Scenario:  $BENCH_DIR/env/bin/python $REPO/deploy/demo/demo_scenario_http.py http://127.0.0.1:8001 $SITE sites/$SITE/private/sample_users.json"
