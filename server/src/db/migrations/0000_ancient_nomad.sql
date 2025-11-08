CREATE TABLE `users` (
	`did` text PRIMARY KEY NOT NULL,
	`name` text,
	`avatar` text,
	`socials` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
