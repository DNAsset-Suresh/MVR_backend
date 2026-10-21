# MVR website and booking platform

Madurai V. Ramakrishnan — Motivational Speaker, Educationist, Mentor.

HTML5, CSS3 and vanilla JavaScript communicate with an Express REST API and PostgreSQL. There is no frontend framework, mock database, hard-coded availability or public admin dashboard access.

## Run locally

Requires Node.js 22+ and PostgreSQL (verified here with Node 24 and PostgreSQL 18).

```sh
npm ci
```

Copy `.env.example` to `.env`, create an empty PostgreSQL database and set `DATABASE_URL`, `APP_ORIGIN=http://localhost:3000` and `PORT=3000`. Then:

```sh
npm run migrate
npm run seed
npm run dev
```

Open <http://localhost:3000>. Admin sign-in: <http://localhost:3000/admin/login.html>.

This workspace already has isolated development and test databases on `127.0.0.1:55432`; their generated credentials are in the ignored `.env` file. Their data is under `.local/pgdata`. They are separate from any pre-existing PostgreSQL installation's databases. No production data was imported. To restart this workspace's database on Windows:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D '.local\pgdata' -l '.local\postgres.log' -o '-p 55432 -h 127.0.0.1' -w start
```

## Create your administrator

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and optionally `ADMIN_NAME` in your shell, then run `npm run admin:create`. The script creates a new account; it never promotes public registrations. Remove these variables afterward. Do not commit passwords or use the synthetic QA account credentials for deployment.

## Project structure

```text
frontend/                  34 HTML pages; CSS and vanilla JS modules
  admin/                   Team workspace and separate login
  user/                    Overview, bookings, enquiry details and profile
backend/
  app.js, server.js         Express routes, security and notification worker
  database/                PostgreSQL pool and transaction helper
  middleware/              Sessions, CSRF and role permissions
  routes/                  Auth, user, admin, availability, content and chatbot
  services/                Booking transactions, templates and integrations
  validators/              Strict server-side schemas
database/                  Schema, versioned migrations, approved initial seed
scripts/                   Migrations, admin creation, checks, isolated UI QA
tests/                     Real PostgreSQL integration and security tests
deploy/                    Database-role setup and HTTPS proxy configuration
compose.yaml               Local Docker stack
compose.production.yaml    HTTPS production overlay
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Node watch mode |
| `npm start` | Start Express and notification worker |
| `npm run migrate` / `npm run db:migrate` | Apply versioned database changes |
| `npm run seed` | Add only the MVR facts supplied in the brief |
| `npm run admin:create` | Create a super administrator from shell variables |
| `npm run build` | Check JavaScript syntax and HTML document setup; no bundler needed |
| `npm test` | Run tests in a unique schema in `TEST_DATABASE_URL` |
| `node scripts/generate-pages.js` | Regenerate HTML documents after editing their templates |

Backend libraries are limited to Express, `pg`, Helmet, cookie parsing, rate limiting, Zod validation and Nodemailer. They provide routing, database access, security, input validation and SMTP delivery. Frontend runtime dependencies: zero.

## What works

Separate user/admin authentication; automatic login after registration; password reset; profiles; published-date calendar; seven-step booking form; references; booking history; holds, confirmation, cancellation and completion; role-controlled CMS and uploads; user management; audit logs; in-app notifications; queued email, WhatsApp and Google Calendar adapters; approved-information chatbot and booking drafts.

Tentative slots are visible but are not selectable for new enquiries. Holds remain active until the team explicitly releases, cancels or confirms them. Completed events retain their booked slot. These are deliberate booking policies.

## Configuration still required for a public launch

The application is implemented and tested locally. It is **not deployed publicly**. Configure a host/domain, production secrets, a real administrator, SMTP sender, team contact information, approved biography/programmes/media, and actual availability. WhatsApp and Google Calendar are optional and need their own provider credentials. See [DEPLOYMENT.md](DEPLOYMENT.md) for exact setup. Unconfigured integrations remain queued; the app never falsely reports delivery.

Documentation: [API](API.md), [Database](DATABASE.md), [Security](SECURITY.md), [Admin guide](ADMIN-GUIDE.md), [Booking system](BOOKING-SYSTEM.md), [Chatbot](CHATBOT.md), [Testing](TESTING.md).

## October 2026 account and booking update

- Availability uses First Half and Second Half for every published date. Full Day selects both in one enquiry. Reserved and manually blocked halves display as **Blocked**; enquiry statuses such as Confirmed remain distinct.
- Registration requires first and last names. Alternate contact and its WhatsApp flag are persisted. Selecting the flag uses that alternate number for WhatsApp notifications. Community is no longer a registration organisation type.
- Customers cannot change their registered email or organisation type. Super Admin can use Users → Edit email / type; an email change invalidates existing sessions and reset links.
- Book MVR includes a keyboard-accessible category carousel. Existing detailed topic, audience and programme fields remain available.
- Booking Enquiries and each enquiry detail page offer Print and Export to Word (.docx), including contact details, event information, private notes and status history. Access requires a booking-reading admin role.
- Coral `#E65A4C` uses dark button text for contrast; deeper coral is used for text and focus rings on light surfaces.

Run `npm install`, `npm run db:migrate`, then `npm start`. Migration 005 retains original schedules as legacy records and preserves enquiry references. Back up an existing database before upgrading. If two existing reservations collapse into the same half, migration rolls back so the administrator can resolve those schedules first. No accounts or enquiries are deleted.
