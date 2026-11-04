# Hosting and deployment plan

**Decision:** self-hosted VPS in Mumbai. The server account is owned by the client, and FlowHQ
has administrator access. There are separate development, staging and production environments.

## 1. Environments

| Env | Where | Purpose | Data | Size (start) |
| --- | --- | --- | --- | --- |
| **Development** | FlowHQ developer machines (frappe_docker devcontainer) | Build and unit-test `factory_ops` | Generated `SAMPLE-` data only | Developer laptop, 8 GB+ RAM for Docker |
| **Staging** | VPS #2, same provider and region | UAT, upgrade rehearsal, monthly **restore drill target**, uptime monitor for prod | Restored production backup (masked where needed) or sample data | 2 vCPU / 4 GB RAM / 80 GB SSD |
| **Production** | VPS #1, Mumbai | Live factory | Real | 4 vCPU / 8 GB RAM / 160 GB NVMe, resize-able |

**Production sizing.** Frappe publishes no single official minimum for a whole ERPNext v16
server. A community production guide for v16 on Docker uses **8 GB RAM, 4 cores, 160 GB SSD**.
Frappe's database guidance suggests about 8 GB RAM for the database alone at scale. For 15–50
users on one host, 8 GB is the floor. Watch memory in the first month and move to 16 GB if MariaDB
or the workers swap. Vertical resize on the same provider is a 10-minute job.

## 2. Provider shortlist

Indicative monthly prices for **4 vCPU / 8 GB in Mumbai**. These come from third-party
comparison pages dated mid-2026 and must be **re-checked on the provider's own pricing page
before purchase**:

| Provider | Region | Indicative price/month | Notes |
| --- | --- | --- | --- |
| E2E Networks | Mumbai/Delhi | ~₹2,800 incl. GST (C2.4: 4 vCPU/8 GB/160 GB) | Indian company, INR billing, Indian object storage |
| AWS Lightsail | ap-south-1 Mumbai | ~$40 (~₹3,400) + GST | Mature snapshots; S3 in Mumbai for backups |
| Akamai/Linode | Mumbai | ~$40 + GST | Simple; object storage availability in Mumbai to check |
| Vultr | Mumbai | ~$48 + GST | — |
| Contabo | Mumbai | ~$7 + GST | Cheapest; mixed reputation for disk/IO consistency; acceptable for **staging only** |

**Recommendation:** E2E Networks or AWS Lightsail for production, chosen on a 1-week trial.
The trial measures disk IO (`fio`), a `bench migrate` duration and page latency from the
factory's internet line. Staging goes with the same provider, one size smaller. Data stays in
India for both the primary copy and the backups.

## 3. Accounts and access

- **Account ownership.** The cloud account, domain registrar and DNS are opened in the
  **client's** name, with the client's billing and GST details. The client holds the root
  credentials and 2FA device.
- **FlowHQ access.**
  - Each FlowHQ engineer gets a named sub-user/IAM user with admin rights, plus their own SSH
    key.
  - No shared logins.
  - Access is revoked by removing the user and the key.
- **Inside ERPNext.**
  - Named System Manager accounts for FlowHQ, with 2FA on (Frappe supports OTP 2FA per role).
  - The `Administrator` password is held by the client in a password manager and used only
    for break-glass.
- **Secrets.** These include DB root password, encryption key, India Compliance key and
  marketplace tokens. They live in the server's `.env` (mode 600) and in the site's encrypted
  fields, never in Git. Copies are kept in the client's password manager.

## 4. Deployment architecture (per VPS)

```
Internet ──443──▶ Caddy (or Traefik from frappe_docker overrides)  ── auto HTTPS (Let's Encrypt)
                     │
                     ▼
               frontend (nginx) ── backend (gunicorn, Frappe)
                                   websocket (socket.io)
                                   queue-short / queue-long workers
                                   scheduler
               MariaDB 11.8 (not exposed to the internet)
               Redis cache + Redis queue (not exposed)
               volumes: sites/, db data, logs
```

- **Images.** Built from frappe_docker's `images/custom` with an `apps.json` pinning Frappe
  v16.55.2, ERPNext v16.53.0, India Compliance and ecommerce_integrations commits, and
  `factory_ops` tag. One image tag per release (`factory-os:2026.11.1`), pushed to a private
  registry. That is the client's GitHub Container Registry or the cloud provider's registry.
- **Compose.** frappe_docker `compose.yaml` + `overrides/compose.mariadb.yaml` +
  `compose.redis.yaml` + an HTTPS override. Our overrides and `.env` live in `deploy/` in this
  repo.
- **Release path.**
  1. CI builds the image and runs tests.
  2. Deploy to staging, then `bench migrate` and smoke tests.
  3. Client UAT sign-off.
  4. Production deploy in a maintenance window after a fresh backup.
  5. Rollback = previous image tag + restore of the pre-deploy backup.

## 5. Backups and recovery

| What | How | Frequency | Retention | Where |
| --- | --- | --- | --- | --- |
| Database + private/public files | `bench --site <site> backup --with-files` inside the backend container | Every 6 hours | 7 days of 6-hourly, 4 weekly, 12 monthly | Encrypted (restic or age) to **Indian-region object storage** in a separate account/bucket with write-only credentials |
| VPS snapshot | Provider snapshot | Weekly | 2 | Provider |
| Point-in-time | MariaDB binary logs shipped every 15 min | Phase 2+ (optional) | 7 days | Object storage |
| Config | `deploy/` in Git; `.env` in the client's password manager | On change | — | — |

**Restore drill.** It runs **before go-live**, then monthly:

1. Restore the latest production backup onto staging.
2. Run the restore script and log in.
3. Check the stock balance report, trial balance and the last 10 documents against production.
4. Record the time taken in `docs/runbooks/restore-log.md`.

**Targets:** RPO ≤ 6 h (≤ 15 min once binlog shipping is on), RTO ≤ 4 h.

## 6. Monitoring and alerts

| Tool | Runs on | Watches | Alert to |
| --- | --- | --- | --- |
| Uptime Kuma (MIT) | **Staging** VPS, so it is independent of production | HTTPS uptime, certificate expiry, a login-page check | Email + WhatsApp/Telegram to FlowHQ on-call and client IT contact |
| Host metrics | Provider monitoring or node-exporter + simple alert script | CPU, RAM, swap, disk > 80%, load | Same |
| Backups | Backup script exit status + daily "latest backup age" check | Missing or failed backup | Same |
| App errors | Frappe Error Log; Sentry (free tier) if the client accepts error data leaving India; otherwise a daily Error Log digest email | Exceptions | FlowHQ |
| Scheduler/queue | `bench doctor` check in cron | Stuck scheduler, queue backlog | FlowHQ |

## 7. Security hardening checklist

- [ ] Ubuntu LTS, unattended security upgrades, automatic reboot window on Sunday 03:00 IST
- [ ] SSH: keys only, no root login, non-standard user per engineer, fail2ban
- [ ] Firewall (provider firewall + ufw): inbound 22 (FlowHQ office/VPN IPs where possible), 80, 443 only
- [ ] MariaDB and Redis bound to the Docker network only; strong unique passwords
- [ ] HTTPS everywhere, HSTS; HTTP → HTTPS redirect
- [ ] Frappe: 2FA for System Manager, Accounts, QC Manager and approver roles; password policy;
      login attempt lockout; session expiry 8 h on shop-floor devices
- [ ] Site config: `allow_cors` off; `developer_mode` off in production; `encryption_key` backed up separately
- [ ] File uploads: private by default for COAs, invoices, HR documents
- [ ] Monthly: dependency and image vulnerability scan (Trivy) in CI; patch in staging, then production
- [ ] Personal data (customer phone, address) visible only to the roles that need it, per DPDP rules; masking in reports
- [ ] Documented offboarding: remove user, key and ERPNext account the same day

## 8. Running cost (client-paid, indicative)

| Item | Monthly (₹, indicative) | Notes |
| --- | --- | --- |
| Production VPS 4 vCPU/8 GB | 2,800 – 4,000 | E2E / Lightsail range; confirm |
| Staging VPS 2 vCPU/4 GB | 1,000 – 2,000 | — |
| Object storage for backups (~100–200 GB with retention) | 300 – 800 | Indian region |
| Domain + DNS | ~100 (annual ~₹1,000) | — |
| Email sending (transactional) | 0 – 500 | Provider SMTP or a mail service |
| India Compliance API credits | Usage-based | Only when e-invoice/e-way bill APIs are used |
| **Total infrastructure** | **≈ ₹4,200 – 7,400 / month** | Excludes FlowHQ support fees |

These are the client's running costs. Per the brief, the client pays hosting and third-party
fees. They are **not** part of the Phase 1 implementation budget, but the client must open the
accounts in week 1.
