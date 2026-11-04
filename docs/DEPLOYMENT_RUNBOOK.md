# Deployment runbook

## 1. Development (working, verified 2026-11-04)

Prerequisites: Ubuntu 24.04, Docker with compose, a non-root user, `uv`, Node 24, and the apt
packages `mariadb-client libmariadb-dev pkg-config build-essential`.

```bash
./deploy/dev/setup-dev.sh
```

The script was written from the steps run by hand to build the current environment. The script itself has not yet been run end to end on a clean machine (OPEN_ISSUES). What it does:

1. `docker compose -f deploy/dev/compose.yaml up -d`: MariaDB 11.8 on `127.0.0.1:3307`, Valkey cache
   on `:13100`, Valkey queue on `:11100`. Development passwords only.
2. Installs CPython 3.14 and `frappe-bench==5.31.1` with uv.
3. `bench init --frappe-branch v16.55.2 --python python3.14 --skip-redis-config-generation`.
4. Points the bench at the Docker services (`bench set-config -g db_host/db_port/redis_*`).
5. `bench get-app --branch v16.53.0 erpnext`; symlinks `apps/factory_ops` from this repo.
6. Creates `factory.localhost` and `test.localhost`, installs ERPNext and factory_ops, enables
   developer mode, and `allow_tests` on the test site.

Daily commands (from the bench directory):

| Task | Command |
| --- | --- |
| Run all tests | `bench --site test.localhost run-tests --app factory_ops` |
| One module | `bench --site test.localhost run-tests --app factory_ops --module factory_ops.tests.test_qc_release` |
| Apply schema/setup changes | `bench --site factory.localhost migrate` |
| Serve Desk | `bench --site factory.localhost serve --port 8000`, then open `/desk` |
| Lint | `uvx ruff@0.14.3 check apps/factory_ops/factory_ops` |

Known setup pitfalls found while building:
- bench refuses to run as root.
- `mysqlclient` needs `libmariadb-dev` and `pkg-config`, otherwise `bench init` fails part-way. Delete
  the half-built bench and re-run.

## 2. Staging — not yet provisioned

Blocked on the client-owned VPS account (HOSTING_AND_DEPLOYMENT_PLAN.md §3). Plan:
- image from frappe_docker `images/custom` with `apps.json` pinning Frappe v16.55.2, ERPNext v16.53.0,
  factory_ops at a git tag (India Compliance added once a GSTIN exists);
- compose with MariaDB 11.8, **Valkey 8.1** (DECISIONS D-004), HTTPS proxy;
- restore drill target and Uptime Kuma host.

## 3. Production — not yet provisioned

Blocked on the client's infrastructure credentials and approval. Nothing will be deployed to
production until staging UAT is signed off. Checklist: HOSTING_AND_DEPLOYMENT_PLAN.md §7.
