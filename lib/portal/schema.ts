/**
 * Database schema for the staff portal, as ordered migrations. Each runs
 * once, inside a transaction, and is recorded in schema_migrations. Never
 * edit a migration that has shipped: add a new one at the end.
 *
 * Works on PostgreSQL 14+ and on the embedded PGlite used when no
 * DATABASE_URL is set.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_core",
    sql: /* sql */ `
-- ── People and access ───────────────────────────────────────────
-- Roles (least privilege; see lib/portal/permissions.ts):
--   admin       Managing Partner / system administrator
--   partner     Partners: all matters except walled-off ones they are not on
--   lawyer      Associates and counsel: only matters they are on
--   litigation  Litigation team (clerks, litigation officers): court diary and
--               service register firm-wide, matter files only where assigned
--   front_desk  Reception: clients' contact details, logging documents served
--               on the firm, the day's court diary; no matter files
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','partner','lawyer','litigation','front_desk')),
  title           TEXT,
  phone           TEXT,
  password_hash   TEXT,                        -- scrypt; NULL until the invite is accepted
  totp_secret     TEXT,                        -- AES-256-GCM encrypted with APP_SECRET
  totp_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID
);

-- One-time links: invitations and password resets (only hashes stored)
CREATE TABLE user_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  purpose     TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id),
  mfa_passed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Sign-in attempts, for throttling by address and by IP
CREATE TABLE login_attempts (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  email     TEXT,
  ip        TEXT,
  success   BOOLEAN NOT NULL
);
CREATE INDEX login_attempts_ip ON login_attempts(ip, at);

-- ── Tamper-evident audit trail ──────────────────────────────────
-- Every row carries the SHA-256 of the previous row, so any edit, deletion
-- or reordering breaks the chain and is detected by verifyAuditChain().
-- Triggers below also refuse UPDATE and DELETE outright.
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL,
  user_id     UUID,
  actor       TEXT NOT NULL,                 -- email, or system:<job>
  action      TEXT NOT NULL,                 -- e.g. matter.viewed, document.downloaded
  entity_type TEXT,
  entity_id   TEXT,
  matter_id   UUID,
  detail      TEXT,                          -- JSON
  ip          TEXT,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL
);
CREATE INDEX audit_matter ON audit_log(matter_id, id);
CREATE INDEX audit_user ON audit_log(user_id, id);

CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Yearly sequence numbers: matters, register entries
CREATE TABLE counters (
  name   TEXT PRIMARY KEY,
  value  INTEGER NOT NULL
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

-- ── Clients ──────────────────────────────────────────────────────
CREATE TABLE clients (
  id              UUID PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('individual','company','government','ngo','other')),
  name            TEXT NOT NULL,
  name_key        TEXT NOT NULL,             -- normalised for conflict checks
  rc_number       TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  contact_person  TEXT,
  source          TEXT,                      -- walk-in, referral, website...
  notes           TEXT,
  kyc_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_name_key ON clients(name_key);

-- ── Matters ──────────────────────────────────────────────────────
CREATE TABLE matters (
  id                    UUID PRIMARY KEY,
  number                TEXT NOT NULL UNIQUE,      -- SSA/LIT/2026/0001
  title                 TEXT NOT NULL,             -- e.g. "Adeyemi v. Lagos Homes Ltd"
  client_id             UUID NOT NULL REFERENCES clients(id),
  practice_area         TEXT NOT NULL,
  matter_type           TEXT NOT NULL CHECK (matter_type IN ('litigation','arbitration','advisory','transaction','regulatory','debt_recovery','other')),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('intake','open','on_hold','closed')),
  confidential          BOOLEAN NOT NULL DEFAULT FALSE,   -- ethical wall: only the matter team can see it
  responsible_partner   UUID REFERENCES users(id),
  court                 TEXT,
  suit_number           TEXT,
  judge                 TEXT,
  description           TEXT,
  opened_on             DATE NOT NULL,
  closed_on             DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matters_client ON matters(client_id);
CREATE INDEX matters_status ON matters(status);

CREATE TABLE matter_members (
  matter_id   UUID NOT NULL REFERENCES matters(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead','member')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by    UUID,
  PRIMARY KEY (matter_id, user_id)
);
CREATE INDEX matter_members_user ON matter_members(user_id);

-- Everyone else connected to a matter; searched by the conflict check
CREATE TABLE parties (
  id          UUID PRIMARY KEY,
  matter_id   UUID NOT NULL REFERENCES matters(id),
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,
  role        TEXT NOT NULL,      -- claimant, defendant, opposing_counsel, counterparty, witness, related
  contact     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);
CREATE INDEX parties_name_key ON parties(name_key);
CREATE INDEX parties_matter ON parties(matter_id);

-- Attendance and file notes
CREATE TABLE matter_notes (
  id          UUID PRIMARY KEY,
  matter_id   UUID NOT NULL REFERENCES matters(id),
  kind        TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','attendance','call','system')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);
CREATE INDEX matter_notes_matter ON matter_notes(matter_id, created_at);

-- ── Court diary ─────────────────────────────────────────────────
-- Each sitting is one row. Recording an adjournment closes the sitting and
-- opens the next one, so the history of a suit reads as a chain.
CREATE TABLE hearings (
  id            UUID PRIMARY KEY,
  matter_id     UUID NOT NULL REFERENCES matters(id),
  sitting_on    DATE NOT NULL,
  sitting_time  TEXT,                       -- "09:00"
  court         TEXT NOT NULL,
  judge         TEXT,
  suit_number   TEXT,
  business      TEXT NOT NULL,              -- mention, hearing, trial, ruling, judgment...
  appearing     UUID REFERENCES users(id),  -- counsel to appear
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','held','adjourned','vacated','concluded')),
  outcome       TEXT,
  previous_id   UUID REFERENCES hearings(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID
);
CREATE INDEX hearings_date ON hearings(sitting_on);
CREATE INDEX hearings_matter ON hearings(matter_id);

-- ── Service register ────────────────────────────────────────────
-- Inward: processes and letters served on the firm (on its clients' behalf).
-- Outward: what the firm serves on others. Keeps how, when and by whom,
-- the proof, and any deadline the service sets running.
CREATE TABLE service_register (
  id            UUID PRIMARY KEY,
  number        TEXT NOT NULL UNIQUE,      -- IN/2026/0001, OUT/2026/0001
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  kind          TEXT NOT NULL,             -- writ, originating_summons, motion, hearing_notice, judgment, letter, regulator, other
  title         TEXT NOT NULL,
  matter_id     UUID REFERENCES matters(id),
  party         TEXT NOT NULL,             -- served by (inward) / served on (outward)
  method        TEXT NOT NULL,             -- personal, bailiff, courier, post, email, substituted, hand
  served_on     DATE NOT NULL,
  served_at     TEXT,                      -- time, e.g. "14:20"
  served_by     TEXT,                      -- who delivered it
  received_by   TEXT,                      -- who signed for it
  proof         TEXT,                      -- acknowledged copy, affidavit of service, courier waybill...
  response_due  DATE,
  handled_by    UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','filed')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX service_due ON service_register(status, response_due);
CREATE INDEX service_matter ON service_register(matter_id);

-- ── Tasks and deadlines ─────────────────────────────────────────
CREATE TABLE tasks (
  id            UUID PRIMARY KEY,
  title         TEXT NOT NULL,
  detail        TEXT,
  matter_id     UUID REFERENCES matters(id),
  assigned_to   UUID REFERENCES users(id),
  due_on        DATE,
  kind          TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','deadline')),
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  source        TEXT,                      -- manual, meeting:<id>, service:<id>
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  completed_at  TIMESTAMPTZ,
  completed_by  UUID
);
CREATE INDEX tasks_open ON tasks(status, due_on);
CREATE INDEX tasks_assignee ON tasks(assigned_to, status);

-- ── Documents ───────────────────────────────────────────────────
-- Files are stored outside the web root and only served through an
-- authorised route. Each version keeps its SHA-256, checked on every
-- download. A new version shares the first version's series_id.
CREATE TABLE documents (
  id            UUID PRIMARY KEY,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('matter','service','meeting')),
  owner_id      UUID NOT NULL,
  matter_id     UUID REFERENCES matters(id),
  series_id     UUID NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  title         TEXT NOT NULL,
  category      TEXT,                      -- pleading, correspondence, evidence, contract, court_order, id, other
  file_name     TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT NOT NULL,
  sha256        TEXT NOT NULL,
  storage_key   TEXT NOT NULL,
  privileged    BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by   UUID,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID
);
CREATE INDEX documents_owner ON documents(owner_type, owner_id);
CREATE INDEX documents_matter ON documents(matter_id);
CREATE INDEX documents_series ON documents(series_id, version);

-- ── Meetings, transcripts and AI minutes ───────────────────────
CREATE TABLE meetings (
  id                 UUID PRIMARY KEY,
  matter_id          UUID REFERENCES matters(id),
  title              TEXT NOT NULL,
  held_on            DATE NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'client' CHECK (kind IN ('client','internal','counterparty','court','other')),
  participants       TEXT,
  consent_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,   -- everyone was told the meeting is recorded
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','transcribing','transcribed','summarising','ready','failed')),
  audio_document_id  UUID,
  transcript         TEXT,
  transcript_source  TEXT,                 -- recording, upload, paste
  minutes            TEXT,                 -- JSON: summary, decisions, action_items, ...
  minutes_model      TEXT,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meetings_matter ON meetings(matter_id);
`,
  },
  {
    id: "0002_notifications_and_word",
    sql: /* sql */ `
-- ── Reminders by email and SMS ──────────────────────────────────
ALTER TABLE users ADD COLUMN notify_email BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_sms BOOLEAN NOT NULL DEFAULT TRUE;

-- Every message sent (or attempted). dedupe_key stops the same reminder
-- going out twice, e.g. digest:2026-11-05 or service:<id>.
CREATE TABLE notifications (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id),
  channel      TEXT NOT NULL CHECK (channel IN ('email','sms')),
  kind         TEXT NOT NULL,                -- digest, court_tomorrow, deadline, served, assigned, test
  dedupe_key   TEXT NOT NULL,
  recipient    TEXT NOT NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider_ref TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_once ON notifications(user_id, channel, dedupe_key) WHERE status = 'sent';
CREATE INDEX notifications_recent ON notifications(created_at);

CREATE TABLE job_runs (
  job       TEXT NOT NULL,
  run_date  DATE NOT NULL,
  ran_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail    TEXT,
  PRIMARY KEY (job, run_date)
);

-- ── Personal access tokens (the Word add-in) ────────────────────
-- Shown once when created; only a hash is stored. Revocable at any time.
CREATE TABLE api_tokens (
  token_hash    TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX api_tokens_user ON api_tokens(user_id);
`,
  },
  {
    id: "0003_inbox",
    sql: /* sql */ `
-- ── Personal inbox ──────────────────────────────────────────────
-- Files saved from outside the portal (phone share, Windows "Send to", the
-- watched folder, bulk upload) can land in the person's own inbox, to be
-- filed to a matter later. Only the owner can see their inbox.
ALTER TABLE documents DROP CONSTRAINT documents_owner_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_owner_type_check CHECK (owner_type IN ('matter','service','meeting','inbox'));
ALTER TABLE documents ADD COLUMN source TEXT;    -- browser, phone_share, camera, windows, folder, word
`,
  },
  {
    id: "0004_firm_modules",
    sql: /* sql */ `
-- ── Calendar feeds ─────────────────────────────────────────────
-- A private address per person that calendar apps (Google, Outlook, iPhone)
-- subscribe to. Only a hash is stored; resetting it stops the old address.
CREATE TABLE calendar_feeds (
  user_id      UUID PRIMARY KEY REFERENCES users(id),
  token_hash   TEXT NOT NULL UNIQUE,
  detail       TEXT NOT NULL DEFAULT 'minimal' CHECK (detail IN ('minimal','full')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- ── Precedents and templates ───────────────────────────────────
CREATE TABLE templates (
  id           UUID PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',  -- letter, engagement, court, corporate, property, other
  description  TEXT,
  file_name    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  sha256       TEXT NOT NULL,
  storage_key  TEXT NOT NULL,
  fields       TEXT,                           -- JSON list of {{fields}} found in the document
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Contacts directory ─────────────────────────────────────────
CREATE TABLE contacts (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  organisation  TEXT,
  kind          TEXT NOT NULL DEFAULT 'other',  -- court, registry, counsel, bailiff, agency, expert, vendor, bank, client_contact, other
  role          TEXT,
  email         TEXT,
  phone         TEXT,
  phone_alt     TEXT,
  address       TEXT,
  website       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ
);
CREATE INDEX contacts_name ON contacts(lower(name));
CREATE TABLE contact_matters (
  contact_id  UUID NOT NULL REFERENCES contacts(id),
  matter_id   UUID NOT NULL REFERENCES matters(id),
  note        TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by    UUID,
  PRIMARY KEY (contact_id, matter_id)
);

-- ── Company secretarial register ───────────────────────────────
CREATE TABLE entities (
  id                 UUID PRIMARY KEY,
  client_id          UUID REFERENCES clients(id),
  name               TEXT NOT NULL,
  entity_type        TEXT NOT NULL,          -- private_ltd, public_plc, ltd_gte, business_name, incorporated_trustees, llp, other
  rc_number          TEXT,
  incorporated_on    DATE,
  registered_address TEXT,
  share_capital      TEXT,
  tin                TEXT,
  firm_role          TEXT,                   -- company_secretary, retained_counsel, filing_agent
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','struck_off','dissolved')),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE entity_officers (
  id            UUID PRIMARY KEY,
  entity_id     UUID NOT NULL REFERENCES entities(id),
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,               -- director, secretary, trustee, chairman, proprietor, psc
  nationality   TEXT,
  address       TEXT,
  appointed_on  DATE,
  ceased_on     DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID
);
CREATE TABLE entity_shareholdings (
  id            UUID PRIMARY KEY,
  entity_id     UUID NOT NULL REFERENCES entities(id),
  holder        TEXT NOT NULL,
  share_class   TEXT NOT NULL DEFAULT 'Ordinary',
  shares        BIGINT NOT NULL,
  acquired_on   DATE,
  ceased_on     DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID
);
CREATE TABLE entity_filings (
  id            UUID PRIMARY KEY,
  entity_id     UUID NOT NULL REFERENCES entities(id),
  kind          TEXT NOT NULL,               -- annual_return, agm, change_of_directors, allotment, address_change, psc, tax_return, other
  title         TEXT NOT NULL,
  due_on        DATE,
  filed_on      DATE,
  reference     TEXT,
  responsible   UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','filed','waived')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID
);
CREATE INDEX entity_filings_due ON entity_filings(status, due_on);

-- ── Office and IT register ─────────────────────────────────────
CREATE TABLE assets (
  id            UUID PRIMARY KEY,
  kind          TEXT NOT NULL,               -- laptop, desktop, phone, tablet, printer, network, storage, software, subscription, domain, furniture, other
  name          TEXT NOT NULL,
  make_model    TEXT,
  serial        TEXT,
  assigned_to   UUID REFERENCES users(id),
  location      TEXT,
  purchased_on  DATE,
  cost          TEXT,
  supplier      TEXT,
  warranty_until DATE,
  renews_on     DATE,
  status        TEXT NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use','spare','repair','retired','lost')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Systems people can sign in to (email admin, bank, CAC portal, court e-filing...).
-- Never passwords: only who holds access, so access can be removed when people leave.
CREATE TABLE systems (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT,
  owner_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);
CREATE TABLE system_access (
  system_id   UUID NOT NULL REFERENCES systems(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  level       TEXT NOT NULL DEFAULT 'user',  -- user, admin, signatory
  granted_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  revoked_on  DATE,
  note        TEXT,
  PRIMARY KEY (system_id, user_id)
);

-- ── Mailbox in the portal ──────────────────────────────────────
-- Each person's own email account. The password is encrypted with APP_SECRET.
CREATE TABLE mail_accounts (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  address       TEXT NOT NULL,
  imap_host     TEXT NOT NULL,
  imap_port     INTEGER NOT NULL,
  imap_secure   BOOLEAN NOT NULL DEFAULT TRUE,
  smtp_host     TEXT NOT NULL,
  smtp_port     INTEGER NOT NULL,
  smtp_secure   BOOLEAN NOT NULL DEFAULT TRUE,
  username      TEXT NOT NULL,
  password_enc  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at    TIMESTAMPTZ,
  last_error    TEXT
);
`,
  },
];
