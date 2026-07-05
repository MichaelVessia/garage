CREATE TABLE `user_settings_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL UNIQUE,
	`weight_unit` text DEFAULT 'lbs' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO user_settings_new (id, user_id, weight_unit, created_at, updated_at)
SELECT id, user_id, weight_unit, created_at, updated_at FROM user_settings;
--> statement-breakpoint
DROP TABLE user_settings;
--> statement-breakpoint
ALTER TABLE user_settings_new RENAME TO user_settings;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_settings_user_id` ON `user_settings` (`user_id`);
