# Verification report — 8 October 2026

## Automated checks

`npm test`: **20 tests passed, 0 failed, 0 skipped**, against PostgreSQL 18. Each run creates a unique schema in a separate test database and removes only that schema afterward. The suite refuses to use the application's database as the test database. The administrator bootstrap command was also exercised and verified to reject duplicate accounts.

Covered: health/public routes; registration validation and password hashing; automatic session; separate admin authentication; protected HTML/API access; CSRF, Origin and role rejection; availability create/edit; overlapping-slot rejection; public-note privacy; block/unblock; tentative/manual-booked/hold/release behavior; arbitrary-date and invalid enquiry rejection; duplicate prevention; own-booking/profile access; review and more-information history; simultaneous confirmation (one success, one conflict); cancellation and completion; notifications/audit/user management; CMS publication and roles; grounded chatbot and drafts; password reset, token reuse rejection and session invalidation; whole-day blocking; safe uploads; actual local SMTP delivery and retry handling; Google/WhatsApp adapter payloads with mocked provider responses.

`npm run build`: JavaScript syntax validation and document checks passed for **34 HTML pages**. Assets are served directly; no frontend framework/bundler is used.

`npm audit --omit=dev`: **0 reported vulnerabilities** after updating Nodemailer to 10.0.16. An audit is a point-in-time advisory check, not a security certification.

## Browser workflow

Used a separate local QA server and isolated PostgreSQL schema with clearly synthetic accounts. Verified through the actual interface:

1. Administrator login and empty dashboard.
2. Creation of a dated time slot with private notes.
3. Separate user login and account overview.
4. Public date/time selection, with unpublished dates disabled and private notes absent.
5. Account details prefilled in the seven-step booking form.
6. Review and submission producing `MVR-2026-00001` in the QA database.
7. Administrator booking detail, date hold and confirmation.
8. Public slot changed to Booked and became unselectable.
9. Completed status visible in the customer's own history.
10. User logout, registration form rendering and mobile chatbot answers from the approved biography.

Registration creation and password reset were exercised by the API suite; the browser registration form was inspected without creating additional credentials. Cancellation, block/unblock, user management and security attacks were covered by API tests in addition to the browser checks above.

Browser width checks: **360, 390, 768, 1024, 1440 and 1920 CSS pixels**. Checked the homepage, registration, availability calendar, booking form, user dashboard, admin dashboard and admin user table. Mobile sidebar overflow discovered during QA was fixed; the repeated checks reported no document-level horizontal overflow. Wide data tables scroll within their own containers. The mobile calendar/chatbot were also visually inspected.

Keyboard controls, visible focus styling, labelled forms, reduced-motion CSS, semantic headings and live status messaging are implemented and reviewed. No claim is made of an exhaustive assistive-technology audit across every browser/device.

Screenshots captured during QA are in the ignored `test-results/` folder. They show synthetic data, not real bookings.

## Not verified externally

- Production SMTP provider delivery: credentials not supplied. The SMTP protocol and retry worker were tested with a local SMTP server.
- Live WhatsApp/Google Calendar delivery: credentials not supplied. Their request payloads/authentication handling were tested using mocked HTTP responses.
- Docker image build/start and public HTTPS: Docker/hosting not available in this environment. The Docker package is prepared for the selected deployment path.
- Real MVR content/media, contact numbers and available dates: require approval/input from the MVR team; none was fabricated.

## October 2026 verification

25 real PostgreSQL integration tests cover fixed pairs, migration preservation and rollback, first/last name validation, alternate WhatsApp persistence, frozen profile identity and Super Admin permissions, Full Day versus half-day confirmation races, cancellation/hold release of both halves, database reservation constraints, print escaping, real OOXML exports and access controls, plus the existing authentication/CMS/notification workflows.

Browser QA used a disposable schema and synthetic accounts. Verified calendar halves and Full Day, login draft continuity, category selection, complete enquiry submission, read-only profile fields and admin export links. Desktop and 390px mobile booking screenshots are retained in test-results (not included in the deployment package). The mobile document had no horizontal overflow. Primary coral buttons use dark text with contrast above 4.5:1.

The DOCX download was validated as an OOXML ZIP and checked for complete enquiry content. The documents skill renderer could not render pages because LibreOffice is absent from this machine; Word page layout remains visually unverified. Print HTML was reviewed in the browser. Docker image execution remains untested here because Docker is not installed.
