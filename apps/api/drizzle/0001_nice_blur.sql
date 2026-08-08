-- `imports` gana la cuenta a la que fue el fichero (ver DATA_MODEL.md y ADR-012).
--
-- SQLite no admite añadir una columna NOT NULL sin valor por defecto a una
-- tabla que tenga filas, así que este ALTER solo pasa con `imports` vacía. Lo
-- está en cualquier base que pueda existir hoy: hasta esta migración no había
-- pipeline, y ninguna ruta ni script ha insertado nunca un import. Si algún día
-- no lo estuviera, esto falla con un mensaje claro en vez de inventarse una
-- cuenta para las filas viejas, que es el fallo que se quiere.
ALTER TABLE `imports` ADD `account_id` integer NOT NULL REFERENCES accounts(id);--> statement-breakpoint
CREATE INDEX `imports_cuenta_idx` ON `imports` (`account_id`);
