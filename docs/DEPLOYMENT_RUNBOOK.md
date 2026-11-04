# Deployment runbook

## 1. Development (working, verified 2026-11-04)

Prerequisites: Ubuntu 24.04, Docker with compose, a non-root user, `uv`, Node 24, and the apt
packages `mariadb-client libmariadb-dev pkg-config build-essential`.

```bash
./deploy/dev/setup-dev.sh
```

Verified 2026-11-05 on a clean OS user with an empty home directory, from a fresh clone; its test
site then passed the full suite. Ports and compose project can be overridden to run a second,
independent environment:

```bash
DEV_PROJECT=factory-os-clean DEV_DB_PORT=3308 DEV_CACHE_PORT=13101 DEV_QUEUE_PORT=11101 ./deploy/dev/setup-dev.sh
```

What it does:

1. `docker compose -f deploy/dev/compose.yaml up -d --wait`: MariaDB 11.8 on `127.0.0.1:3307` (waits for
   its healthcheck), **Valkey 8.1** cache on `:13100` and queue on `:11100`. Development passwords only.
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

SAMPLE data and users on the development site (after the script):

```bash
bench --site factory.localhost execute factory_ops.setup.sample_company.setup_dev_site
bench --site factory.localhost execute factory_ops.setup.sample_users.create_sample_users
```

The second command writes random passwords to `sites/factory.localhost/private/sample_users.json`
(mode 600, never committed). With the site served on port 8000:

```bash
python deploy/dev/acceptance_http.py http://127.0.0.1:8000 factory.localhost sites/factory.localhost/private/sample_users.json
```

```bash
node deploy/dev/ui_check.js sites/factory.localhost/private/sample_users.json /tmp/shots <reject QC Release> <draft QC Release> <held batch>
```

Production acceptance (after `acceptance_http.py`, same site and credentials). It prints the FG Work
Order and held FG batch for the browser check:

```bash
python deploy/dev/acceptance_production_http.py http://127.0.0.1:8000 factory.localhost sites/factory.localhost/private/sample_users.json
```

```bash
node deploy/dev/ui_check_production.js sites/factory.localhost/private/sample_users.json /tmp/shots <FG Work Order> <held FG batch>
```

Background workers and scheduler (development; production uses the frappe_docker services). Run each in
its own terminal from the bench directory:

```bash
bench worker --queue short,default,long
```

```bash
bench schedule
```

```bash
bench --site factory.localhost enable-scheduler
```

`bench doctor` lists workers online; `Scheduled Job Type.last_execution` (site time, IST) shows the
scheduler running. The dev-site check enqueued a job and the nightly
`factory_ops.quality.batch_status.nightly_consistency_check` through the worker; both finished.

Known setup pitfalls found while building:
- Docker Hub can refuse anonymous pulls with HTTP 429 (rate limit). Development workaround: pull the same
  images from Google's mirror and tag them with the names the compose file uses, then re-run the script:
  `docker pull mirror.gcr.io/library/mariadb:11.8 && docker tag mirror.gcr.io/library/mariadb:11.8 mariadb:11.8`
  (likewise `mirror.gcr.io/valkey/valkey:8.1-alpine`).
- A standard Print Format (e.g. Batch Label) is reloaded on `migrate` only when the `modified`
  timestamp in its JSON changes. Bump it with every edit.
- bench refuses to run as root.
- `mysqlclient` needs `libmariadb-dev` and `pkg-config`, otherwise `bench init` fails part-way. Delete
  the half-built bench and re-run.
- bench writes `sites/apps.txt` without a trailing newline; append with a newline first (fixed in the
  script and CI).
- A fresh v16 site has batch tracking off; `setup_dev_site` turns it on (DECISIONS D-016).
- The v16 login page is rendered by JavaScript; browser automation logs in through `/api/method/login`.

## 2. Staging — not yet provisioned

Blocked on the client-owned VPS account (HOSTING_AND_DEPLOYMENT_PLAN.md §3). Plan:
- image from frappe_docker `images/custom` with `apps.json` pinning Frappe v16.55.2, ERPNext v16.53.0,
  factory_ops at a git tag (India Compliance added once a GSTIN exists);
- compose with MariaDB 11.8, **Valkey 8.1** (DECISIONS D-004), HTTPS proxy;
- restore drill target and Uptime Kuma host.

## 3. Production — not yet provisioned

Blocked on the client's infrastructure credentials and approval. Nothing will be deployed to
production until staging UAT is signed off. Checklist: HOSTING_AND_DEPLOYMENT_PLAN.md §7.
