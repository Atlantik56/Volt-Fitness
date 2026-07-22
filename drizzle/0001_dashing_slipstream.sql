CREATE TABLE `daily_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`steps` integer DEFAULT 0 NOT NULL,
	`active_minutes` integer DEFAULT 0 NOT NULL,
	`calories` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_activity_date_unique` ON `daily_activity` (`date`);