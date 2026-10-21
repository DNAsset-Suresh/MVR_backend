# Deployment package

Selected architecture: Docker Compose with Node.js/Express, PostgreSQL 18, persistent PostgreSQL/uploads volumes, a separate migration service and an optional Caddy HTTPS proxy. The public HTML and REST API share an origin. No paid host is selected or provisioned.

**Status:** source and Docker configuration are prepared. The app has run against real PostgreSQL locally. Docker is not installed in the current environment, so the container build/start and public HTTPS deployment have **not** been executed here. There is no production URL yet.

## 1. Local Docker run

Install Docker Engine with the Compose plugin, or Docker Desktop, on the target machine. Copy `.env.example` to `.env.docker` and set:

```text
MVR_ENV_FILE=.env.docker
APP_ORIGIN=http://localhost:3000
NODE_ENV=development
POSTGRES_PASSWORD=<long-random-URL-safe-owner-password>
APP_DB_PASSWORD=<different-long-random-URL-safe-app-password>
```

Generate passwords with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store each generated result in your private environment file. Empty/default passwords are rejected by Compose. Do not reuse the local development database credentials.

```sh
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

Open <http://localhost:3000>. The database has no host port. The app port is bound to loopback. `migrate` must exit successfully before `app` starts. Named volumes preserve records and media across restarts. Never run `docker compose down -v` on a populated system unless intentional data destruction is authorized.

## 2. Production host and HTTPS

On a Docker-capable Linux host, point your domain's DNS A/AAAA record to that host. Allow inbound TCP 80/443. Copy the package and create `.env.production` with fresh credentials and:

```text
MVR_ENV_FILE=.env.production
APP_ORIGIN=https://your-real-domain
DOMAIN=your-real-domain
NODE_ENV=production
TRUST_PROXY=1
POSTGRES_PASSWORD=<new-owner-password>
APP_DB_PASSWORD=<new-runtime-password>
```

Set the real email/integration values below. Keep `.env.production` private and out of Git/backups intended for public distribution.

```sh
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml ps
```

Caddy provisions HTTPS after DNS resolves and ports are reachable. The app refuses a production APP_ORIGIN that is not HTTPS. Keep the same Compose project name when upgrading so the named volumes remain attached. Changing database passwords in an environment file does not rotate existing PostgreSQL roles; rotate roles and connection secrets together through your database administrator.

Create the first admin using your local shell's `ADMIN_EMAIL`, `ADMIN_PASSWORD` and optional `ADMIN_NAME`, passed to a one-off app container:

```sh
docker compose --env-file .env.production run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_NAME app node scripts/create-admin.js
```

Admin URL: `https://your-real-domain/admin/login.html`. Remove the bootstrap password variables from the shell afterward. The script creates new accounts and refuses duplicate emails.

## 3. Email — REQUIRES CONFIGURATION

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, and optionally `ADMIN_NOTIFICATION_EMAIL`. Port 465 uses implicit TLS; 587 uses the SMTP provider's STARTTLS support. Use a verified sending domain and configure the provider's DNS authentication. Restart the app, request a password reset to a controlled test account, and verify actual receipt before launch.

Templates cover received enquiries, review, more information, date holds, confirmation, cancellation and completion. The outbox worker runs every fifteen seconds. An unconfigured service leaves jobs pending. Delivery failures retry every five minutes up to five attempts. Admin Settings shows queued/sent/failed counts; inspect failed jobs with restricted database access. After fixing a provider problem, an operator may reset selected failed jobs to pending, zero attempts and `available_at=now()`.

## 4. WhatsApp — OPTIONAL, REQUIRES CONFIGURATION

The public **WhatsApp MVR Team** link is configured in Admin Settings → WhatsApp team number. Supply country code plus digits, with no employee's personal number embedded in source.

For Business API notifications, configure `WHATSAPP_ENABLED=true`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE`. Create and approve a utility template with two body parameters: booking reference and status. Enable delivery only for recipients whose consent you have obtained; phone collection alone should not be treated as consent. The integration sends via the official `/messages` endpoint; see [Meta's template API reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/). Verify the active API version for your Meta app and test with an approved recipient before enabling production.

## 5. Google Calendar — OPTIONAL, REQUIRES CONFIGURATION

Enable Google Calendar API in your Google Cloud project, create OAuth client credentials, and obtain an offline refresh token for the calendar owner with the `calendar.events` scope. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`. No Google credentials or calendar identifiers are sent to the browser.

Confirmed bookings enqueue calendar creation; cancelled bookings enqueue deletion. Event IDs derive from the booking UUID to avoid duplicates. The adapter uses the [Google Calendar events.insert API](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) and IST timestamps. Test actual creation/cancellation in a private test calendar before enabling your operational calendar.

## 6. Content, operations and validation

Publish approved biography, programmes, speaking topics, media, trust information, FAQs and team contact details through the CMS. Publish actual available dates. No achievements, testimonials or availability are fabricated by the seed.

Use one app replica with the supplied in-memory rate limiter. For multiple replicas, provide a shared limiter and shared media storage first. The Docker runtime is non-root, read-only except its uploads volume, with dropped Linux capabilities. Add host monitoring, backup scheduling and alerting for health-check failures and failed outbox jobs.

Before public launch, run `npm test` against a separate PostgreSQL test database, complete a browser booking on the deployed host, verify HTTPS/cookies, reset email receipt, notification delivery, backup restoration and the chosen calendar/WhatsApp integrations. See [DATABASE.md](DATABASE.md) for backup commands and [TESTING.md](TESTING.md) for what was verified locally.

## Upgrading to fixed half-day bookings

Stop the application during the database upgrade and take a PostgreSQL backup. Rebuild the image so the Word export dependency is installed, then run the existing migration service before starting the app. Migration 005 is transactional and keeps old hourly schedules for audit; if legacy reservations collide after conversion into halves, it rolls back without discarding enquiries. Resolve those source reservations before retrying. Existing date halves with no previously published availability remain Blocked until an admin opens them.

Word exports are generated entirely in Node.js and do not require Microsoft Word or LibreOffice on the deployment server. LibreOffice is only needed for optional visual QA of the generated documents.
