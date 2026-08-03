-- Validate every legacy medication value before changing any live table. The
-- dynamic RAISE message identifies the first unsupported record and value so
-- the owner can correct it without guessing.
DROP TRIGGER IF EXISTS `canonical_medication_migration_reject`;--> statement-breakpoint
DROP TABLE IF EXISTS `canonical_medication_migration_error`;--> statement-breakpoint
CREATE TABLE `canonical_medication_migration_error` (
  `entity` text NOT NULL,
  `record_id` text NOT NULL,
  `value` text NOT NULL
);--> statement-breakpoint
CREATE TRIGGER `canonical_medication_migration_reject`
BEFORE INSERT ON `canonical_medication_migration_error`
BEGIN
  SELECT RAISE(
    ABORT,
    'Canonical medication migration rejected ' || NEW.entity ||
    ' record ' || quote(NEW.record_id) || ' value ' || quote(NEW.value)
  );
END;--> statement-breakpoint

INSERT INTO `canonical_medication_migration_error` (`entity`, `record_id`, `value`)
SELECT 'injection schedule drug', `id`, `drug`
FROM `injection_schedules`
WHERE lower(trim(`drug`)) NOT IN (
  'semaglutide',
  'semaglutide (ozempic)',
  'semaglutide (wegovy)',
  'semaglutide (compounded)',
  'tirzepatide',
  'tirzepatide (mounjaro)',
  'tirzepatide (zepbound)',
  'tirzepatide (compounded)',
  'retatrutide',
  'retatrutide (compounded)',
  'liraglutide',
  'liraglutide (saxenda)',
  'dulaglutide',
  'dulaglutide (trulicity)'
)
LIMIT 1;--> statement-breakpoint

INSERT INTO `canonical_medication_migration_error` (`entity`, `record_id`, `value`)
SELECT 'injection log drug', `id`, `drug`
FROM `injection_logs`
WHERE lower(trim(`drug`)) NOT IN (
  'semaglutide',
  'semaglutide (ozempic)',
  'semaglutide (wegovy)',
  'semaglutide (compounded)',
  'tirzepatide',
  'tirzepatide (mounjaro)',
  'tirzepatide (zepbound)',
  'tirzepatide (compounded)',
  'retatrutide',
  'retatrutide (compounded)',
  'liraglutide',
  'liraglutide (saxenda)',
  'dulaglutide',
  'dulaglutide (trulicity)'
)
LIMIT 1;--> statement-breakpoint

INSERT INTO `canonical_medication_migration_error` (`entity`, `record_id`, `value`)
SELECT 'injection log dosage', `id`, `dosage`
FROM `injection_logs`
WHERE
  substr(lower(trim(`dosage`)), -2) <> 'mg'
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) = ''
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) GLOB '*[^0-9.]*'
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) LIKE '.%'
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) LIKE '%.'
  OR (
    length(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2))) -
    length(replace(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)), '.', ''))
  ) > 1
  OR CAST(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) AS real) <= 0
  OR CAST(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) AS real) > 1.7976931348623157e308
LIMIT 1;--> statement-breakpoint

INSERT INTO `canonical_medication_migration_error` (`entity`, `record_id`, `value`)
SELECT 'schedule phase dosage', `id`, `dosage`
FROM `schedule_phases`
WHERE
  substr(lower(trim(`dosage`)), -2) <> 'mg'
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) = ''
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) GLOB '*[^0-9.]*'
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) LIKE '.%'
  OR trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) LIKE '%.'
  OR (
    length(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2))) -
    length(replace(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)), '.', ''))
  ) > 1
  OR CAST(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) AS real) <= 0
  OR CAST(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) AS real) > 1.7976931348623157e308
LIMIT 1;--> statement-breakpoint

DROP TRIGGER `canonical_medication_migration_reject`;--> statement-breakpoint
DROP TABLE `canonical_medication_migration_error`;--> statement-breakpoint

CREATE TABLE `injection_schedules_new` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `drug` text NOT NULL,
  `supplier` text,
  `frequency` text NOT NULL,
  `start_date` text NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `notes` text,
  `user_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `injection_schedules_drug_supported`
    CHECK (`drug` IN ('Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide'))
);--> statement-breakpoint

INSERT INTO `injection_schedules_new` (
  `id`, `name`, `drug`, `supplier`, `frequency`, `start_date`, `is_active`,
  `notes`, `user_id`, `created_at`, `updated_at`
)
SELECT
  `id`,
  `name`,
  CASE
    WHEN lower(trim(`drug`)) IN (
      'semaglutide', 'semaglutide (ozempic)', 'semaglutide (wegovy)', 'semaglutide (compounded)'
    ) THEN 'Semaglutide'
    WHEN lower(trim(`drug`)) IN (
      'tirzepatide', 'tirzepatide (mounjaro)', 'tirzepatide (zepbound)', 'tirzepatide (compounded)'
    ) THEN 'Tirzepatide'
    WHEN lower(trim(`drug`)) IN ('retatrutide', 'retatrutide (compounded)') THEN 'Retatrutide'
    WHEN lower(trim(`drug`)) IN ('liraglutide', 'liraglutide (saxenda)') THEN 'Liraglutide'
    WHEN lower(trim(`drug`)) IN ('dulaglutide', 'dulaglutide (trulicity)') THEN 'Dulaglutide'
  END,
  `source`,
  `frequency`,
  `start_date`,
  `is_active`,
  `notes`,
  `user_id`,
  `created_at`,
  `updated_at`
FROM `injection_schedules`;--> statement-breakpoint

CREATE TABLE `schedule_phases_new` (
  `id` text PRIMARY KEY NOT NULL,
  `schedule_id` text NOT NULL REFERENCES `injection_schedules_new`(`id`) ON DELETE CASCADE,
  `order` integer NOT NULL,
  `duration_days` integer,
  `dose_mg` real NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `schedule_phases_dose_mg_positive_finite`
    CHECK (`dose_mg` > 0 AND `dose_mg` <= 1.7976931348623157e308)
);--> statement-breakpoint

INSERT INTO `schedule_phases_new` (
  `id`, `schedule_id`, `order`, `duration_days`, `dose_mg`, `created_at`, `updated_at`
)
SELECT
  `id`,
  `schedule_id`,
  `order`,
  `duration_days`,
  CAST(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) AS real),
  `created_at`,
  `updated_at`
FROM `schedule_phases`;--> statement-breakpoint

CREATE TABLE `injection_logs_new` (
  `id` text PRIMARY KEY NOT NULL,
  `datetime` text NOT NULL,
  `drug` text NOT NULL,
  `supplier` text,
  `dose_mg` real NOT NULL,
  `injection_site` text,
  `notes` text,
  `schedule_id` text REFERENCES `injection_schedules_new`(`id`) ON DELETE SET NULL,
  `user_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `injection_logs_drug_supported`
    CHECK (`drug` IN ('Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide')),
  CONSTRAINT `injection_logs_dose_mg_positive_finite`
    CHECK (`dose_mg` > 0 AND `dose_mg` <= 1.7976931348623157e308)
);--> statement-breakpoint

INSERT INTO `injection_logs_new` (
  `id`, `datetime`, `drug`, `supplier`, `dose_mg`, `injection_site`, `notes`,
  `schedule_id`, `user_id`, `created_at`, `updated_at`
)
SELECT
  `id`,
  `datetime`,
  CASE
    WHEN lower(trim(`drug`)) IN (
      'semaglutide', 'semaglutide (ozempic)', 'semaglutide (wegovy)', 'semaglutide (compounded)'
    ) THEN 'Semaglutide'
    WHEN lower(trim(`drug`)) IN (
      'tirzepatide', 'tirzepatide (mounjaro)', 'tirzepatide (zepbound)', 'tirzepatide (compounded)'
    ) THEN 'Tirzepatide'
    WHEN lower(trim(`drug`)) IN ('retatrutide', 'retatrutide (compounded)') THEN 'Retatrutide'
    WHEN lower(trim(`drug`)) IN ('liraglutide', 'liraglutide (saxenda)') THEN 'Liraglutide'
    WHEN lower(trim(`drug`)) IN ('dulaglutide', 'dulaglutide (trulicity)') THEN 'Dulaglutide'
  END,
  `source`,
  CAST(trim(substr(trim(`dosage`), 1, length(trim(`dosage`)) - 2)) AS real),
  `injection_site`,
  `notes`,
  `schedule_id`,
  `user_id`,
  `created_at`,
  `updated_at`
FROM `injection_logs`;--> statement-breakpoint

DROP TABLE `injection_logs`;--> statement-breakpoint
DROP TABLE `schedule_phases`;--> statement-breakpoint
DROP TABLE `injection_schedules`;--> statement-breakpoint
ALTER TABLE `injection_schedules_new` RENAME TO `injection_schedules`;--> statement-breakpoint
ALTER TABLE `schedule_phases_new` RENAME TO `schedule_phases`;--> statement-breakpoint
ALTER TABLE `injection_logs_new` RENAME TO `injection_logs`;--> statement-breakpoint
CREATE INDEX `idx_injection_schedules_user_id` ON `injection_schedules` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_injection_schedules_is_active` ON `injection_schedules` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_schedule_phases_schedule_id` ON `schedule_phases` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `idx_injection_logs_datetime` ON `injection_logs` (`datetime`);--> statement-breakpoint
CREATE INDEX `idx_injection_logs_drug` ON `injection_logs` (`drug`);--> statement-breakpoint
CREATE INDEX `idx_injection_logs_user_id` ON `injection_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_injection_logs_schedule_id` ON `injection_logs` (`schedule_id`);
