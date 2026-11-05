# SOS&A Practice Portal: handover and running guide

The private staff area of the website, at `/portal`. It holds the firm's
clients, matters, court diary, service register, tasks, documents and
meetings, and sends reminders by email and SMS. This guide is for whoever
runs it: the Managing Partner, an IT provider, or a developer.

## What it does

| Area | What it is for |
|---|---|
| **Today** | Each person's day: court this week, their tasks, responses due, their matters. |
| **Matters** | Every file: parties, team, notes, court history, documents, tasks, meetings, service. Numbered `SSA/LIT/2026/0001` (LIT, ARB, DRC, ADV, TRN, REG, GEN). |
| **Conflict check** | Runs before any matter can be opened. Searches every client and party on every matter, including walled-off ones, ignoring titles, word order and "Ltd/Plc". Each check is logged. |
| **Court diary** | Every sitting. Recording an adjournment creates the next date and an optional preparation deadline. Printable daily cause list, also exported to Word. |
| **Service register** | Every process or letter served *on* the firm (`IN/2026/…`) and *by* the firm (`OUT/2026/…`): how, when, by whom, proof, scans, and the response deadline, which becomes a task and an instant email/SMS to the responsible lawyer. |
| **Tasks** | From people, the diary, the register and meeting minutes. |
| **Meetings & minutes** | Record in the browser (phone or laptop), upload a recording, or paste a Zoom/Teams/Meet transcript. Speech-to-text with speaker labels, then AI-drafted minutes: summary, decisions, action items (one click to tasks), deadlines, risks and a draft follow-up email. A lawyer must approve them. |
| **Documents** | Encrypted, fingerprinted, versioned. Downloadable for editing; saved back from Word with the add-in. |
| **Inbox & save from anywhere** | Each person's private inbox for files not yet on a matter. Files arrive by drag and drop (many files or whole folders), the phone camera, the phone's Share menu (installed portal app, Android), Windows "Send to → SOS&A Portal", the watched `Documents\Portal Inbox` folder (a subfolder named `SSA-LIT-2026-0001` files onto that matter), and Word. File to a matter with one click. |
| **Search** | Everything a person may see, in one box. |
| **Word** | Exports (matter summary, minutes, cause list) and the "Save to Portal" add-in for Word. |
| **Mailbox** | Each person connects their own firm email (IMAP/SMTP): read, reply, forward, send, and file any email (.eml, opens in Outlook) or attachment to a matter in one click. Emails display with scripts blocked and internet pictures off. Nobody can open a colleague's mailbox. |
| **Email to the portal** | Forward or send to the intake address (e.g. `portal@segunsipeolu.com`) and the email and attachments land in your Inbox. `[SSA/LIT/2026/0001]` in the subject files it onto that matter. Only verified staff senders are accepted. |
| **Templates** | The firm's precedents as Word files with `{{fields}}` (client, matter, court, suit number, parties, next date, service details…). Generate for a matter in one click: it downloads to open in Word and a copy is saved on the matter. Starter letter of engagement, letter of demand and affidavit of service included. |
| **Calendar sync** | Each person's private calendar address for Google, Outlook or iPhone: court dates, deadlines, tasks, responses due, company filings and (admin) renewals. Matter numbers only by default, because calendar companies keep copies. |
| **Contacts** | Courts, registries, counsel, bailiffs, agencies, experts and banks, linked to matters; call, WhatsApp, email, or save to phone (vCard). |
| **Company secretarial** | Client companies: officers, shareholders (with percentages), and filings with due dates. Appointing or removing a director adds a 14-day CAC deadline; filing an annual return or AGM adds next year's. |
| **Reports** | For partners: open matters, new instructions per month, workload by lawyer and practice area, court outcomes, overdue work by person, company filings due; CSV export. |
| **Office & IT** | Equipment, licences, subscriptions and domains, with renewal reminders; who has access to which systems (never passwords); a leaver's checklist showing exactly what to collect and revoke. |
| **Reminders** | Morning email digest per person; SMS for court today/tomorrow and urgent deadlines; instant alert when a document is served. |
| **Administration** | People and roles, the audit trail (with integrity check), system health, backups. |

## Security (confidentiality, integrity, availability)

**Confidentiality: least privilege**

| Role | Can |
|---|---|
| Managing Partner / Admin | Everything, including people, audit trail and backups. |
| Partner | All matters except walled-off ones they are not on; opens matters; manages teams; places ethical walls. |
| Lawyer | Only matters they are on. |
| Litigation team | Firm-wide court diary and service register; matter files only where assigned. |
| Front desk | Client contact details, logging documents served on the firm, the day's cause list. No matter files. |

- Every page and every action checks access on the server; hidden buttons are never the only protection. The full role table is on *People & access*.
- **Ethical walls**: a walled-off matter is visible only to its team, partners included.
- Sign-in: passwords of at least 12 characters (scrypt hashes); **two-factor sign-in with an authenticator app is required for partners and the admin** (`PORTAL_REQUIRE_2FA=all` extends it to everyone); lockout after 5 wrong attempts; sign-out after 30 minutes idle and 12 hours at most.
- Files are encrypted at rest (AES-256-GCM) and served only through an authorised route.
- SMS reminders never contain client names or case details.

**Integrity**
- The audit trail records every sign-in, view, download, change and denied attempt. Each entry is chained to the previous one by SHA-256, and the database refuses edits and deletions. *Audit trail* re-checks the whole chain every time it opens.
- Every document's SHA-256 is recorded; a file that fails its check is not served, and the failure is logged.
- Notes, register entries and documents are never deleted, only marked; new document versions never overwrite old ones.

**Availability**
- *System & backups → Download database backup* exports every record (passwords and two-factor secrets are left out).
- Runs on any Node.js host with PostgreSQL. With no `DATABASE_URL`, it uses a built-in PostgreSQL stored on disk, so it works on a single server with nothing else to install.

## Hosting it

The portal is part of this Next.js site. Two sound options:

1. **One server (VPS, e.g. a Lagos or European cloud server)**: `npm ci && npm run build && npm start`, behind HTTPS (Caddy or Nginx). The built-in database and the files live in `PORTAL_DATA_DIR`. Back up that folder nightly.
2. **Managed hosting (e.g. Railway or Render)** with a managed PostgreSQL: set `DATABASE_URL`, and mount a persistent volume for `PORTAL_DATA_DIR` (uploaded files).

Serverless hosts without a persistent disk (e.g. Vercel) need `DATABASE_URL`, plus file storage moved to S3/R2. That is a small change in `lib/portal/storage.ts`.

Settings are listed in `.env.example`. The minimum for production: `APP_SECRET`, `PORTAL_SETUP_TOKEN`, `PORTAL_URL`.

### First run
1. Deploy with the settings above, then open `/portal`. It goes to **Set up**.
2. Enter `PORTAL_SETUP_TOKEN`, then create the Managing Partner's account and set up two-factor.
3. *People & access → Invite*: each person gets a one-time link (72 hours) to set their password.

### Reminders
Ask any scheduler to call this every morning at 06:00 UTC (7am Lagos):

```
GET https://<site>/portal/api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

On a server, use crontab:

```
0 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.segunsipeolu.com/portal/api/cron/reminders
```

Running it twice sends nothing twice. *System & backups* shows each run and every message sent. Email uses Brevo (`BREVO_API_KEY`, verified sender `NOTIFY_FROM_EMAIL`). SMS uses Termii (`TERMII_API_KEY` and an approved `TERMII_SENDER_ID`).

### Mailbox and email to the portal
- Set `MAIL_IMAP_HOST`/`MAIL_SMTP_HOST` (and ports) so staff only enter their address and password under *Mailbox*. With Google Workspace or Microsoft 365, staff need an app password (IMAP must be allowed for the account).
- For email to the portal: create a mailbox such as `portal@segunsipeolu.com`, set the `PORTAL_INTAKE_*` settings, and have a scheduler call `/portal/api/cron/mail-intake` (Bearer `CRON_SECRET`) every 5-15 minutes. Accepted mail is moved to `Filed`, refused mail to `Rejected`, inside that mailbox.

### Meeting transcription and AI minutes
- Speech-to-text: Deepgram (`DEEPGRAM_API_KEY`). To change provider, replace `transcribeAudio()` in `lib/portal/transcribe.ts`.
- Minutes: Claude by Anthropic (`ANTHROPIC_API_KEY`), model `claude-opus-5-5`, structured output, in `lib/portal/minutes.ts`.
- Before switching either on, check the provider's data-processing terms (no training on your data, deletion after processing). Recordings are privileged.
- Recording requires everyone present to have agreed; the portal asks for this confirmation first.

### Phone app and Windows helper
- **Phone:** open the portal in Chrome, then *Add to Home screen → Install*. On Android it then appears in every app's Share menu. Nothing is cached on the phone (`public/portal-sw.js`).
- **Windows:** *Save from anywhere* in the portal has the download (`/portal/desktop/ssa-portal.ps1`, built with this portal's address). Right-click it, then *Run with PowerShell*, and paste a connection code. It adds Send to and the Portal Inbox folder (started at sign-in). The code is stored with Windows DPAPI for that user only. Remove with `ssa-portal.ps1 -Uninstall` in `%APPDATA%\SOSA Portal`; activity is logged in `activity.log` there.

### The Word add-in
*Save from Word* in the portal has the steps. In short: download `/word/manifest.xml`, add it in Word (Home → Add-ins → My Add-ins → Upload My Add-in), or deploy it to everyone from the Microsoft 365 admin centre → Integrated apps. Each person then pastes a connection code from their Account page. Word requires the site to be on HTTPS.

## Things to keep safe
- **`APP_SECRET`**: without it, stored files and two-factor secrets cannot be decrypted. Keep it in two separate safe places (e.g. a password manager and a sealed envelope in the safe).
- **The data folder** (`PORTAL_DATA_DIR`) or the PostgreSQL database, plus the files folder: back them up nightly, keep 30 days, and test a restore every quarter.
- **The Managing Partner's authenticator.** If that phone is lost, another admin can reset the account. Keep two admins.

## For developers
- Code: `app/portal` (pages and server actions), `app/portal/api` (uploads, downloads, exports, Word, reminders), `lib/portal` (database, security, data access), `components/portal` (UI).
- Access rules live in one place: `lib/portal/permissions.ts`. Data access in `lib/portal/data.ts` applies them in SQL.
- Database changes: add a new entry at the end of `lib/portal/schema.ts`. Never edit a shipped migration; they run automatically on start.
- The public website is untouched apart from a "Staff portal" link in the footer.
