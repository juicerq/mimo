CREATE TABLE `actions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`botId` text NOT NULL,
	`account` text,
	`summary` text NOT NULL,
	`result` text NOT NULL,
	`detail` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `bots` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL,
	`provider` text NOT NULL,
	`modelId` text NOT NULL,
	`reasoning` text NOT NULL,
	`prompt` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_name` ON `bots` (lower("name"));--> statement-breakpoint
CREATE TABLE `compactions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` text NOT NULL,
	`start` integer NOT NULL,
	`summary` text NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`botId` text NOT NULL,
	`askedBy` text,
	FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`askedBy`) REFERENCES `bots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` text NOT NULL,
	`id` text NOT NULL,
	`entry` text NOT NULL,
	`turnId` text NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turnId`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_identity` ON `deliveries` (`conversationId`,`id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`botId` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`botId`, `position`),
	FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_text` ON `memories` (`botId`,`text`);--> statement-breakpoint
CREATE TABLE `messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` text NOT NULL,
	`id` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_identity` ON `messages` (`conversationId`,`id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` text NOT NULL,
	`id` text NOT NULL,
	`turnId` text,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`event` text NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turnId`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_identity` ON `records` (`conversationId`,`id`);--> statement-breakpoint
CREATE INDEX `record_order` ON `records` (`conversationId`,`seq`);--> statement-breakpoint
CREATE INDEX `record_kind` ON `records` (`conversationId`,`kind`,`seq`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`botId` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`everyMinutes` integer NOT NULL,
	`createdAt` text NOT NULL,
	`nextRunAt` text NOT NULL,
	`lastRunAt` text,
	`lastError` text,
	`enabled` integer NOT NULL,
	FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_name` ON `routines` (`botId`,`name`);--> statement-breakpoint
CREATE TABLE `speeches` (
	`conversationId` text NOT NULL,
	`turnId` text NOT NULL,
	`callId` text NOT NULL,
	`text` text NOT NULL,
	`done` integer NOT NULL,
	PRIMARY KEY(`conversationId`, `callId`),
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turnId`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`conversationId` text NOT NULL,
	`status` text NOT NULL,
	`finalSpeech` text,
	`failure` text,
	`startedAt` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "turn_status" CHECK("turns"."status" in ('running', 'stopping', 'finished', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turns_id_unique` ON `turns` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `active_turn` ON `turns` (`conversationId`) WHERE "turns"."status" in ('running', 'stopping');