CREATE TABLE IF NOT EXISTS crm_contacts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source text NOT NULL CHECK(source IN ('instagram','whatsapp','telegram','website','yandex','2gis','google','dikidi','manual')),
 external_id text NOT NULL,
 name text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,external_id)
);
CREATE TABLE IF NOT EXISTS crm_leads (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 contact_id bigint NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','working','booked','closed')),
 service text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 booking_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_one_open_lead ON crm_leads(contact_id) WHERE status IN ('new','working');
CREATE INDEX IF NOT EXISTS crm_leads_status_date ON crm_leads(status,updated_at DESC);
CREATE TABLE IF NOT EXISTS crm_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 lead_id bigint NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
 source text NOT NULL,
 event_id text NOT NULL,
 text text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,event_id)
);
CREATE TABLE IF NOT EXISTS crm_notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 lead_id bigint NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_notifications_due ON crm_notifications(next_attempt_at) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_bot_state (
 chat_id text PRIMARY KEY, mode text NOT NULL DEFAULT '', draft jsonb NOT NULL DEFAULT '{}',
 consented_at timestamptz, reminders boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_bot_updates (
 update_id bigint PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_bot_reminders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 lead_id bigint NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
 booking_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(lead_id,booking_at)
);

CREATE TABLE IF NOT EXISTS crm_instagram_poll_state (
 connection_key text PRIMARY KEY, started_at timestamptz NOT NULL, watermark timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_dikidi_mail_sync (
 mailbox text PRIMARY KEY,
 uid_validity text NOT NULL,
 last_uid bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
