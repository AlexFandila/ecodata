PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
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
	CONSTRAINT "transactions_category_source_valido" CHECK(category_source IS NULL OR category_source IN ('rule', 'manual', 'suggestion', 'transfer')),
	CONSTRAINT "transactions_booked_at_iso" CHECK(booked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_value_date_iso" CHECK(value_date IS NULL OR value_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_categoria_con_origen" CHECK((category_id IS NULL) = (category_source IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "account_id", "booked_at", "value_date", "amount_cents", "currency", "counterparty", "description", "category_id", "category_source", "transfer_id", "deleted_at", "import_id", "source_hash", "raw") SELECT "id", "account_id", "booked_at", "value_date", "amount_cents", "currency", "counterparty", "description", "category_id", "category_source", "transfer_id", "deleted_at", "import_id", "source_hash", "raw" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_source_hash_unico` ON `transactions` (`source_hash`);--> statement-breakpoint
CREATE INDEX `transactions_cuenta_fecha_idx` ON `transactions` (`account_id`,`booked_at`);--> statement-breakpoint
CREATE INDEX `transactions_categoria_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_import_idx` ON `transactions` (`import_id`);--> statement-breakpoint
CREATE INDEX `transactions_matching_idx` ON `transactions` (`currency`,`amount_cents`,`booked_at`) WHERE deleted_at IS NULL AND transfer_id IS NULL;