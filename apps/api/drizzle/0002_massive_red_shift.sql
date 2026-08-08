CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`target_amount_cents` integer NOT NULL,
	`target_date` text,
	`params` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "goals_type_valido" CHECK(type IN ('house', 'car', 'emergency_fund', 'custom')),
	CONSTRAINT "goals_target_date_iso" CHECK(target_date IS NULL OR target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "goals_target_amount_positivo" CHECK(target_amount_cents > 0)
);
