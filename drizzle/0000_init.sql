CREATE TABLE `ai_analysis_records` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text,
	`run_id` text,
	`document_id` text,
	`task` text NOT NULL,
	`provider` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`prompt_version` text NOT NULL,
	`cache_key` text NOT NULL,
	`status` text NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`correlation_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_cache_idx` ON `ai_analysis_records` (`cache_key`);--> statement-breakpoint
CREATE INDEX `ai_created_idx` ON `ai_analysis_records` (`created_at`);--> statement-breakpoint
CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`actor_id` text,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`ref_no` text NOT NULL,
	`application_id` text NOT NULL,
	`finding_id` text,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`why_it_matters` text NOT NULL,
	`recommended_action` text NOT NULL,
	`responsible_party` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`assignee_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_ref_no_unique` ON `alerts` (`ref_no`);--> statement-breakpoint
CREATE INDEX `alerts_app_idx` ON `alerts` (`application_id`);--> statement-breakpoint
CREATE INDEX `alerts_status_idx` ON `alerts` (`status`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`ref_no` text NOT NULL,
	`institution_id` text NOT NULL,
	`category_id` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`academic_year` text NOT NULL,
	`declared_institution_name` text NOT NULL,
	`declared_institution_ref` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`affiliated_university` text DEFAULT '' NOT NULL,
	`programme_name` text DEFAULT '' NOT NULL,
	`approved_intake` integer,
	`proposed_intake` integer,
	`previous_approval_ref` text DEFAULT '' NOT NULL,
	`accreditation_details` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`payment_reference` text DEFAULT '' NOT NULL,
	`payment_amount` integer,
	`declaration_accepted` integer DEFAULT false NOT NULL,
	`review_priority` text DEFAULT 'LOW' NOT NULL,
	`priority_score` integer DEFAULT 0 NOT NULL,
	`priority_factors` text DEFAULT '[]' NOT NULL,
	`is_synthetic` integer DEFAULT true NOT NULL,
	`submitted_at` integer,
	`created_by_id` text NOT NULL,
	`assigned_officer_id` text,
	`documents_changed_at` integer,
	`last_validated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `application_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_officer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_ref_no_unique` ON `applications` (`ref_no`);--> statement-breakpoint
CREATE INDEX `apps_inst_idx` ON `applications` (`institution_id`);--> statement-breakpoint
CREATE INDEX `apps_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE INDEX `apps_officer_idx` ON `applications` (`assigned_officer_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`actor_id` text,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`entity_ref` text DEFAULT '' NOT NULL,
	`previous_state` text DEFAULT '' NOT NULL,
	`new_state` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`correlation_id` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `application_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`requires_payment` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_categories_code_unique` ON `application_categories` (`code`);--> statement-breakpoint
CREATE TABLE `certificate_records` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`certificate_ref` text NOT NULL,
	`issuing_authority` text NOT NULL,
	`recorded_by_id` text NOT NULL,
	`is_demo` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificate_records_certificate_ref_unique` ON `certificate_records` (`certificate_ref`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`doc_type_code` text NOT NULL,
	`mandatory` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `application_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`doc_type_code`) REFERENCES `document_types`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_cat_doc_uq` ON `checklist_items` (`category_id`,`doc_type_code`);--> statement-breakpoint
CREATE TABLE `document_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`text` text NOT NULL,
	`method` text NOT NULL,
	`ocr_confidence` real,
	FOREIGN KEY (`document_id`) REFERENCES `uploaded_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_doc_page_uq` ON `document_pages` (`document_id`,`page_number`);--> statement-breakpoint
CREATE TABLE `document_types` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`has_expiry` integer DEFAULT false NOT NULL,
	`is_infrastructure` integer DEFAULT false NOT NULL,
	`description` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`source_code` text NOT NULL,
	`source_name` text NOT NULL,
	`source_type` text NOT NULL,
	`method` text NOT NULL,
	`result` text NOT NULL,
	`returned_fields` text DEFAULT '{}' NOT NULL,
	`evidence_ref` text DEFAULT '' NOT NULL,
	`initiated_by` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `uploaded_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verif_doc_idx` ON `document_verifications` (`document_id`);--> statement-breakpoint
CREATE TABLE `uploaded_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`doc_type_code` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`storage_driver` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`replaces_id` text,
	`extraction_status` text DEFAULT 'PENDING' NOT NULL,
	`extraction_error` text,
	`page_count` integer DEFAULT 0 NOT NULL,
	`verification_status` text DEFAULT 'VERIFICATION_PENDING' NOT NULL,
	`uploaded_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `docs_app_idx` ON `uploaded_documents` (`application_id`);--> statement-breakpoint
CREATE INDEX `docs_sha_idx` ON `uploaded_documents` (`sha256`);--> statement-breakpoint
CREATE TABLE `extracted_document_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`page` integer,
	`evidence` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `uploaded_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fields_doc_idx` ON `extracted_document_fields` (`document_id`);--> statement-breakpoint
CREATE TABLE `validation_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`ref_no` text NOT NULL,
	`run_id` text NOT NULL,
	`application_id` text NOT NULL,
	`rule_id` text,
	`rule_code` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`result` text NOT NULL,
	`document_id` text,
	`field` text,
	`page` integer,
	`actual_value` text DEFAULT '' NOT NULL,
	`expected_value` text DEFAULT '' NOT NULL,
	`explanation` text NOT NULL,
	`recommended_action` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`human_review_required` integer DEFAULT true NOT NULL,
	`source` text NOT NULL,
	`ai_explanation` text DEFAULT '' NOT NULL,
	`ai_explanation_source` text DEFAULT '' NOT NULL,
	`review_status` text DEFAULT 'OPEN' NOT NULL,
	`reviewed_by_id` text,
	`reviewed_at` integer,
	`review_reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `validation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `validation_findings_ref_no_unique` ON `validation_findings` (`ref_no`);--> statement-breakpoint
CREATE INDEX `findings_app_idx` ON `validation_findings` (`application_id`);--> statement-breakpoint
CREATE INDEX `findings_run_idx` ON `validation_findings` (`run_id`);--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`ref_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`affiliated_university` text NOT NULL,
	`approval_status` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_phone` text NOT NULL,
	`is_synthetic` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_ref_id_unique` ON `institutions` (`ref_id`);--> statement-breakpoint
CREATE TABLE `official_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`decision` text NOT NULL,
	`decided_by_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_ref` text NOT NULL,
	`institution_id` text NOT NULL,
	`amount` integer NOT NULL,
	`paid_at` integer NOT NULL,
	`ledger_status` text NOT NULL,
	`source` text DEFAULT 'SYNTHETIC_LEDGER' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_records_transaction_ref_unique` ON `payment_records` (`transaction_ref`);--> statement-breakpoint
CREATE TABLE `rectification_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`responded_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`finding_id` text,
	`reviewer_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `obs_app_idx` ON `review_observations` (`application_id`);--> statement-breakpoint
CREATE TABLE `ruleset_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ruleset_versions_version_unique` ON `ruleset_versions` (`version`);--> statement-breakpoint
CREATE TABLE `application_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_id` text,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `status_hist_app_idx` ON `application_status_history` (`application_id`);--> statement-breakpoint
CREATE TABLE `stored_blobs` (
	`key` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`institution_id` text,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_inst_idx` ON `users` (`institution_id`);--> statement-breakpoint
CREATE TABLE `validation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_code` text NOT NULL,
	`ruleset_version_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`categories` text DEFAULT '*' NOT NULL,
	`source_reference` text DEFAULT 'DEMO RULE — illustrative only, not an official AICTE regulation' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`effective_date` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ruleset_version_id`) REFERENCES `ruleset_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_version_code_uq` ON `validation_rules` (`ruleset_version_id`,`rule_code`);--> statement-breakpoint
CREATE TABLE `validation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`ruleset_version_id` text NOT NULL,
	`ruleset_version_label` text NOT NULL,
	`triggered_by_id` text,
	`status` text NOT NULL,
	`ai_mode` text NOT NULL,
	`ai_provider` text NOT NULL,
	`ai_model` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`summary_source` text DEFAULT '' NOT NULL,
	`recommendations` text DEFAULT '[]' NOT NULL,
	`correlation_id` text NOT NULL,
	`finding_count` integer DEFAULT 0 NOT NULL,
	`critical_count` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ruleset_version_id`) REFERENCES `ruleset_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_app_idx` ON `validation_runs` (`application_id`);--> statement-breakpoint
CREATE TABLE `verification_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`source_type` text NOT NULL,
	`description` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_sources_code_unique` ON `verification_sources` (`code`);