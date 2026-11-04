#!/usr/bin/env bash
# Reproduce the Mintree Factory OS development environment on Ubuntu 24.04.
# Development only. Run as a non-root user that can use docker (bench refuses root).
#   1. MariaDB 11.8 and Valkey run in Docker (deploy/dev/compose.yaml)
#   2. bench runs on the host with Python 3.14 and Node 24
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
FRAPPE_VERSION=v16.55.2
ERPNEXT_VERSION=v16.53.0
BENCH_DIR="${BENCH_DIR:-$HOME/frappe-bench}"
DB_ROOT_PASSWORD="${DEV_DB_ROOT_PASSWORD:-dev-only-root}"
# Ports and compose project can be changed to run a second, independent environment.
export DEV_PROJECT="${DEV_PROJECT:-factory-os-dev}"
export DEV_DB_PORT="${DEV_DB_PORT:-3307}"
export DEV_CACHE_PORT="${DEV_CACHE_PORT:-13100}"
export DEV_QUEUE_PORT="${DEV_QUEUE_PORT:-11100}"
export DEV_DB_ROOT_PASSWORD="$DB_ROOT_PASSWORD"

command -v uv >/dev/null || { echo "Install uv first: https://docs.astral.sh/uv/"; exit 1; }
node --version | grep -q '^v24\.' || { echo "Node 24 is required (Frappe v16 engines: node >=24)"; exit 1; }
for pkg in mariadb-client libmariadb-dev pkg-config build-essential; do
  dpkg -s "$pkg" >/dev/null 2>&1 || { echo "Missing apt package: $pkg"; exit 1; }
done

docker compose -f "$REPO/deploy/dev/compose.yaml" up -d --wait
uv python install 3.14
uv tool install --python 3.14 frappe-bench==5.31.1

if [ ! -d "$BENCH_DIR" ]; then
  bench init --frappe-branch "$FRAPPE_VERSION" --python python3.14 \
    --skip-redis-config-generation --no-backups "$BENCH_DIR"
fi
cd "$BENCH_DIR"
bench set-config -g db_host 127.0.0.1
bench set-config -g -p db_port "$DEV_DB_PORT"
bench set-config -g redis_cache "redis://127.0.0.1:$DEV_CACHE_PORT"
bench set-config -g redis_queue "redis://127.0.0.1:$DEV_QUEUE_PORT"
bench set-config -g redis_socketio "redis://127.0.0.1:$DEV_QUEUE_PORT"
[ -d apps/erpnext ] || bench get-app --branch "$ERPNEXT_VERSION" erpnext https://github.com/frappe/erpnext.git
# factory_ops lives in this repo (a subdirectory), so it is linked rather than cloned by bench.
if [ ! -e apps/factory_ops ]; then
  ln -s "$REPO/apps/factory_ops" apps/factory_ops
  uv pip install --quiet -e apps/factory_ops --python env/bin/python
  grep -qx factory_ops sites/apps.txt || echo factory_ops >> sites/apps.txt
fi

for site in factory.localhost test.localhost; do
  if [ ! -d "sites/$site" ]; then
    bench new-site "$site" --db-root-username root --db-root-password "$DB_ROOT_PASSWORD" \
      --admin-password "$(openssl rand -hex 12)" --install-app erpnext
    bench --site "$site" install-app factory_ops
  fi
  bench --site "$site" set-config developer_mode 1
done
bench --site test.localhost set-config allow_tests true
echo "Done. Run tests:  bench --site test.localhost run-tests --app factory_ops"
echo "Serve:            bench --site factory.localhost serve --port 8000"
