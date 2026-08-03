-- Existing planned values cannot be converted safely until the user's
-- intended IANA timezone is known. The first authenticated browser settings
-- bootstrap validates and converts legacy values before filling this column.
ALTER TABLE `user_settings` ADD COLUMN `timezone` text;
--> statement-breakpoint
-- `pending` is a durable per-user claim. The claim's timezone is immutable
-- until every legacy planned value is converted; concurrent requests help
-- finish that same claim and only `complete` settings are exposed.
ALTER TABLE `user_settings` ADD COLUMN `timezone_migration_state` text NOT NULL DEFAULT 'pending' CHECK (`timezone_migration_state` IN ('pending', 'complete'));
--> statement-breakpoint
-- Provenance invariant: default 0 is created only for rows that already
-- existed before 0014. Every supported post-0014 app/import writer sets 1.
-- The marker also makes sequential conversion retry-safe after a failure.
ALTER TABLE `injection_schedules` ADD COLUMN `calendar_date_migrated` integer NOT NULL DEFAULT 0 CHECK (`calendar_date_migrated` IN (0, 1));
--> statement-breakpoint
ALTER TABLE `user_goals` ADD COLUMN `calendar_date_migrated` integer NOT NULL DEFAULT 0 CHECK (`calendar_date_migrated` IN (0, 1));
