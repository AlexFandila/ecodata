CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`iban` text,
	`is_own` integer DEFAULT true NOT NULL,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "accounts_provider_valido" CHECK(provider IN ('unicaja', 'revolut', 'manual')),
	CONSTRAINT "accounts_type_valido" CHECK(type IN ('checking', 'savings', 'card')),
	CONSTRAINT "accounts_currency_valida" CHECK(currency IN ('EUR', 'USD', 'GBP', 'CHF', 'JPY'))
);
--> statement-breakpoint
CREATE INDEX `accounts_is_own_idx` ON `accounts` (`is_own`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` integer,
	`icon` text,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_kind_valido" CHECK(kind IN ('expense', 'income', 'internal')),
	CONSTRAINT "categories_sin_autopadre" CHECK(parent_id IS NULL OR parent_id <> id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unico` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`file_name` text,
	`imported_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`stats` text
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`priority` integer NOT NULL,
	`field` text NOT NULL,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`category_id` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rules_field_valido" CHECK(field IN ('counterparty', 'description')),
	CONSTRAINT "rules_match_type_valido" CHECK(match_type IN ('contains', 'regex')),
	CONSTRAINT "rules_pattern_no_vacio" CHECK(length(pattern) > 0)
);
--> statement-breakpoint
CREATE INDEX `rules_prioridad_idx` ON `rules` (`priority`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`booked_at` text NOT NULL,
	`value_date` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`counterparty` text,
	`description` text,
	`category_id` integer,
	`category_source` text,
	`transfer_id` integer,
	`deleted_at` integer,
	`import_id` integer NOT NULL,
	`source_hash` text NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_currency_valida" CHECK(currency IN ('EUR', 'USD', 'GBP', 'CHF', 'JPY')),
	CONSTRAINT "transactions_category_source_valido" CHECK(category_source IS NULL OR category_source IN ('rule', 'manual', 'suggestion')),
	CONSTRAINT "transactions_booked_at_iso" CHECK(booked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_value_date_iso" CHECK(value_date IS NULL OR value_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_categoria_con_origen" CHECK((category_id IS NULL) = (category_source IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_source_hash_unico` ON `transactions` (`source_hash`);--> statement-breakpoint
CREATE INDEX `transactions_cuenta_fecha_idx` ON `transactions` (`account_id`,`booked_at`);--> statement-breakpoint
CREATE INDEX `transactions_categoria_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_import_idx` ON `transactions` (`import_id`);--> statement-breakpoint
CREATE INDEX `transactions_matching_idx` ON `transactions` (`currency`,`amount_cents`,`booked_at`) WHERE deleted_at IS NULL AND transfer_id IS NULL;--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`out_txn_id` integer NOT NULL,
	`in_txn_id` integer NOT NULL,
	`status` text NOT NULL,
	`matched_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`out_txn_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`in_txn_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfers_status_valido" CHECK(status IN ('auto', 'confirmed', 'manual')),
	CONSTRAINT "transfers_patas_distintas" CHECK(out_txn_id <> in_txn_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfers_out_txn_unico` ON `transfers` (`out_txn_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transfers_in_txn_unico` ON `transfers` (`in_txn_id`);