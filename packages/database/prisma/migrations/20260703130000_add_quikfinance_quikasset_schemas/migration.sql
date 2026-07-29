CREATE SCHEMA IF NOT EXISTS "app_quikasset";

CREATE SCHEMA IF NOT EXISTS "app_quikfinance";

CREATE TYPE "app_quikasset"."AstStatus" AS ENUM ('Active', 'Inactive');

CREATE TYPE "app_quikasset"."AstAssetStatus" AS ENUM ('Available', 'Assigned', 'InRepair', 'Retired');

CREATE TYPE "app_quikasset"."AstRepairStatus" AS ENUM ('Pending', 'InRepair', 'Repaired', 'Recovered', 'Unrepairable');

CREATE TYPE "app_quikasset"."AstAssignmentStatus" AS ENUM ('Active', 'Returned');

CREATE TABLE "app_quikfinance"."organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "address" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "fiscal_year_start" INTEGER NOT NULL DEFAULT 4,
    "date_format" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "bill_prefix" TEXT NOT NULL DEFAULT 'BILL',
    "gstin" TEXT,
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "tds_apply_level" TEXT NOT NULL DEFAULT 'transaction',
    "tds_liabilities_report" BOOLEAN NOT NULL DEFAULT false,
    "migration_date" DATE,
    "pan" TEXT,
    "state_code" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "default_upi_id" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "custom_fields" TEXT,
    "address_line" TEXT,
    "pin_code" TEXT,
    "fax" TEXT,
    "address_format" TEXT,
    "website" TEXT,
    "use_payment_address" BOOLEAN NOT NULL DEFAULT false,
    "payment_address" TEXT,
    "primary_contact_name" TEXT,
    "sender_email" TEXT,
    "report_basis" TEXT NOT NULL DEFAULT 'accrual',
    "communication_language" TEXT NOT NULL DEFAULT 'en',
    "general_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "customer_vendor_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "quote_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "invoice_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "purchase_order_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."custom_field_definitions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT 'contacts',
    "label" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "data_type" TEXT NOT NULL DEFAULT 'text',
    "options" JSONB,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "show_in_portal" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."profiles" (
    "id" UUID NOT NULL,
    "org_id" TEXT,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "language_preference" TEXT NOT NULL DEFAULT 'en',
    "notification_prefs" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_active_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."currencies" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "app_quikfinance"."exchange_rates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "from_currency" CHAR(3) NOT NULL,
    "to_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."account_categories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normal_balance" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "account_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "category_id" UUID,
    "parent_id" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "account_type" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "show_on_dashboard" BOOLEAN NOT NULL DEFAULT false,
    "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contacts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contact_kind" TEXT NOT NULL DEFAULT 'business',
    "customer_category" TEXT NOT NULL DEFAULT 'customer',
    "customer_code" TEXT,
    "display_name" TEXT NOT NULL,
    "company_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "website" TEXT,
    "customer_language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'active',
    "tax_id" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "payment_terms" INTEGER NOT NULL DEFAULT 30,
    "credit_limit" DECIMAL(20,2),
    "credit_days" INTEGER,
    "price_list" TEXT,
    "tds_applicable" BOOLEAN NOT NULL DEFAULT false,
    "billing_address" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "shipping_address" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    "ar_account_id" UUID,
    "ap_account_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pan" TEXT,
    "gst_treatment" TEXT NOT NULL DEFAULT 'registered',
    "state_code" TEXT,
    "opening_balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tan" TEXT,
    "msme_number" TEXT,
    "cin_number" TEXT,
    "tax_category" TEXT,
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "account_owner" TEXT,
    "salesperson" TEXT,
    "lead_source" TEXT,
    "customer_segment" TEXT,
    "territory" TEXT,
    "region" TEXT,
    "referral_partner" TEXT,
    "portal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "portal_username" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "project_name" TEXT,
    "site_name" TEXT,
    "project_manager" TEXT,
    "contract_value" DECIMAL(20,2),
    "customer_since" DATE,
    "custom_fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contact_persons" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "whatsapp" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_decision_maker" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_persons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contact_bank_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "account_holder_name" TEXT,
    "bank_name" TEXT,
    "account_number_enc" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "swift_code" TEXT,
    "upi_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contact_documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL DEFAULT 'other',
    "file_name" TEXT NOT NULL,
    "storage_url" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contact_emails" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outgoing',
    "to_email" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider_id" TEXT,
    "error" TEXT,
    "related_type" TEXT,
    "related_id" UUID,
    "sent_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contact_comments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "user_id" TEXT,
    "author" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."contact_addresses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "address_type" TEXT NOT NULL DEFAULT 'billing',
    "line1" TEXT,
    "line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "landmark" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."tax_rates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(8,4) NOT NULL,
    "tax_type" TEXT NOT NULL,
    "payable_account_id" UUID,
    "recoverable_account_id" UUID,
    "is_compound" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purchase_description" TEXT,
    "item_type" TEXT NOT NULL DEFAULT 'product',
    "unit" TEXT NOT NULL DEFAULT 'each',
    "sales_price" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "purchase_price" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "income_account_id" UUID,
    "expense_account_id" UUID,
    "asset_account_id" UUID,
    "quantity_on_hand" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hsn_sac_code" TEXT,
    "gst_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "category_name" TEXT,
    "barcode" TEXT,
    "track_inventory" BOOLEAN NOT NULL DEFAULT false,
    "default_warehouse_id" UUID,
    "reorder_quantity" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "preferred_vendor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."invoices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "pdf_url" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "viewed_at" TIMESTAMPTZ(6),
    "journal_entry_id" UUID,
    "created_by" TEXT,
    "place_of_supply" TEXT,
    "round_off" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tcs_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "order_number" TEXT,
    "warehouse_id" UUID,
    "ar_account_id" UUID,
    "salesperson" TEXT,
    "subject" TEXT,
    "terms" TEXT,
    "template_type" TEXT NOT NULL DEFAULT 'classic',
    "irn" TEXT,
    "ack_no" TEXT,
    "ack_date" TIMESTAMPTZ(6),
    "signed_qr_code" TEXT,
    "einvoice_status" TEXT,
    "einvoice_payload" JSONB,
    "eway_bill_no" TEXT,
    "eway_bill_date" TIMESTAMPTZ(6),
    "eway_valid_until" TIMESTAMPTZ(6),
    "eway_status" TEXT,
    "eway_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."invoice_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."bills" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "bill_number" TEXT NOT NULL,
    "vendor_reference" TEXT,
    "order_number" TEXT,
    "warehouse_id" UUID,
    "payment_terms" TEXT,
    "ap_account_id" UUID,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "journal_entry_id" UUID,
    "place_of_supply" TEXT,
    "tds_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."bill_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "bill_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID,
    "payment_type" TEXT NOT NULL,
    "payment_number" TEXT,
    "warehouse_id" UUID,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "unapplied_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "bank_charges" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tds_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "deposit_account_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "memo" TEXT,
    "journal_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID,
    "bill_id" UUID,
    "amount" DECIMAL(20,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."expenses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "vendor_id" UUID,
    "customer_id" UUID,
    "account_id" UUID NOT NULL,
    "project_id" UUID,
    "warehouse_id" UUID,
    "amount" DECIMAL(20,2) NOT NULL,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "payment_account_id" UUID,
    "reference" TEXT,
    "receipt_url" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "is_billed" BOOLEAN NOT NULL DEFAULT false,
    "billed_invoice_id" UUID,
    "is_mileage" BOOLEAN NOT NULL DEFAULT false,
    "distance" DECIMAL(20,2),
    "mileage_rate" DECIMAL(20,2),
    "mileage_unit" TEXT,
    "employee_name" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "journal_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."journal_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "entry_number" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "memo" TEXT,
    "reference_number" TEXT,
    "reporting_method" TEXT NOT NULL DEFAULT 'accrual_and_cash',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "location_id" UUID,
    "department_id" UUID,
    "reverse_date" DATE,
    "reverse_only_on_date" BOOLEAN NOT NULL DEFAULT false,
    "reversal_of_id" UUID,
    "source_type" TEXT,
    "source_id" UUID,
    "created_by" TEXT,
    "approved_by" TEXT,
    "posted_by" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "posted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."journal_entry_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "description" TEXT,
    "contact_id" UUID,
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."bank_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "account_id" UUID,
    "name" TEXT NOT NULL,
    "institution_name" TEXT,
    "account_number_last4" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "current_balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."bank_transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "reference" TEXT,
    "matched_journal_entry_id" UUID,
    "reconciliation_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'imported',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."reconciliations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "statement_start" DATE NOT NULL,
    "statement_end" DATE NOT NULL,
    "statement_balance" DECIMAL(20,2) NOT NULL,
    "book_balance" DECIMAL(20,2) NOT NULL,
    "difference" DECIMAL(20,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completed_by" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."fixed_assets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "asset_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "purchase_cost" DECIMAL(20,2) NOT NULL,
    "salvage_value" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "depreciation_method" TEXT NOT NULL DEFAULT 'straight_line',
    "accumulated_depreciation" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "asset_account_id" UUID,
    "depreciation_expense_account_id" UUID,
    "accumulated_depreciation_account_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "disposal_date" DATE,
    "disposal_amount" DECIMAL(20,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."depreciation_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "fixed_asset_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "journal_entry_id" UUID,
    "posted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."budgets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "location_id" UUID,
    "department_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."departments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL DEFAULT 'department',
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."budget_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."inventory_movements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "movement_date" DATE NOT NULL,
    "movement_type" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL,
    "unit_cost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "source_type" TEXT,
    "source_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."projects" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "customer_id" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "budget_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "billing_method" TEXT NOT NULL DEFAULT 'time_and_materials',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."project_time_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" TEXT,
    "entry_date" DATE NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "billable_rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "is_billed" BOOLEAN NOT NULL DEFAULT false,
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_time_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."recurring_transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "profile_name" TEXT,
    "order_number" TEXT,
    "frequency" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "occurrence_count" INTEGER,
    "next_run_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."email_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "template_type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."document_attachments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."import_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "file_name" TEXT,
    "bank_account_id" UUID,
    "raw_payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."period_locks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "lock_scope" TEXT NOT NULL DEFAULT 'all',
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_locks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."ocr_documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'bill',
    "source_name" TEXT NOT NULL,
    "source_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'parsed',
    "linked_entity_id" UUID,
    "extracted_fields" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."invoice_payment_links" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "provider_link_id" TEXT NOT NULL,
    "reference_id" TEXT,
    "short_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amount_refunded" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "callback_url" TEXT,
    "latest_payment_id" TEXT,
    "raw_response" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payment_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."gateway_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "invoice_id" UUID,
    "provider_link_id" TEXT,
    "provider_payment_id" TEXT,
    "provider_refund_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."quotations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "quotation_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference_number" TEXT,
    "expiry_date" DATE,
    "salesperson" TEXT,
    "project_id" UUID,
    "warehouse_id" UUID,
    "subject" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."quotation_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "quotation_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."sales_orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "sales_order_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference_number" TEXT,
    "expected_shipment_date" DATE,
    "payment_terms" TEXT,
    "delivery_method" TEXT,
    "salesperson" TEXT,
    "warehouse_id" UUID,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."sales_order_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."purchase_orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "purchase_order_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference_number" TEXT,
    "expected_delivery_date" DATE,
    "payment_terms" TEXT,
    "delivery_method" TEXT,
    "warehouse_id" UUID,
    "bill_id" UUID,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."purchase_order_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."credit_notes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "invoice_id" UUID,
    "credit_note_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference_number" TEXT,
    "warehouse_id" UUID,
    "ar_account_id" UUID,
    "salesperson" TEXT,
    "subject" TEXT,
    "place_of_supply" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "journal_entry_id" UUID,
    "terms" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."credit_note_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."vendor_credits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "bill_id" UUID,
    "vendor_credit_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference_number" TEXT,
    "order_number" TEXT,
    "warehouse_id" UUID,
    "ap_account_id" UUID,
    "subject" TEXT,
    "place_of_supply" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "journal_entry_id" UUID,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_credits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."vendor_credit_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "vendor_credit_id" UUID NOT NULL,
    "item_id" UUID,
    "account_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_credit_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."time_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" TEXT,
    "work_date" DATE NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "is_billable" BOOLEAN NOT NULL DEFAULT true,
    "is_billed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."portal_links" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "portal_type" TEXT NOT NULL,
    "contact_id" UUID,
    "display_name" TEXT,
    "email" TEXT,
    "access_token" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "expires_at" TIMESTAMPTZ(6),
    "last_accessed_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."portal_comments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "portal_link_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_email" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."support_conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "portal_link_id" UUID NOT NULL,
    "contact_id" UUID,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."support_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."support_tickets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "portal_link_id" UUID NOT NULL,
    "conversation_id" UUID,
    "contact_id" UUID,
    "ticket_number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "requested_by_name" TEXT,
    "requested_by_email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'portal_chat',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."payment_terms" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "term_type" TEXT NOT NULL DEFAULT 'days',
    "days" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."pdf_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'standard',
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."tds_rates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "tax_act" TEXT NOT NULL DEFAULT 'new_2025',
    "section" TEXT,
    "higher_rate" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."gstins" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "registration_type" TEXT NOT NULL DEFAULT 'registered_regular',
    "legal_name" TEXT,
    "trade_name" TEXT,
    "registered_on" DATE,
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "sez" BOOLEAN NOT NULL DEFAULT false,
    "digital_services" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gstins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."transaction_series" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."warehouses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'business',
    "default_series_id" UUID,
    "gstin_id" UUID,
    "address" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_adjustments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "adjustment_number" TEXT NOT NULL,
    "adjustment_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_value_change" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_adjustment_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "adjustment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_before" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_change" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_after" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "value_change" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_transfers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "transfer_date" DATE NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_transfer_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "transfer_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_requested" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_transferred" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."goods_receipts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "grn_number" TEXT NOT NULL,
    "receipt_date" DATE NOT NULL,
    "purchase_order_id" UUID,
    "vendor_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "bill_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."goods_receipt_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "grn_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "po_line_id" UUID,
    "qty_ordered" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_received" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."approval_policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "require_approval_above" DECIMAL(20,2),
    "approver_role" TEXT NOT NULL DEFAULT 'admin',
    "auto_approve_below" DECIMAL(20,2),
    "sequential_approvals" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."approval_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "policy_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_number" TEXT,
    "entity_amount" DECIMAL(20,2),
    "requested_by" TEXT NOT NULL,
    "assigned_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."bank_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "bank_account_id" UUID,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "match_type" TEXT NOT NULL DEFAULT 'contains',
    "match_field" TEXT NOT NULL DEFAULT 'description',
    "match_value" TEXT NOT NULL,
    "amount_min" DECIMAL(20,2),
    "amount_max" DECIMAL(20,2),
    "transaction_type" TEXT,
    "action_account_id" UUID,
    "action_contact_id" UUID,
    "action_category" TEXT,
    "auto_reconcile" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."gateway_settlements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "provider_settlement_id" TEXT NOT NULL,
    "settlement_date" DATE NOT NULL,
    "gross_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "fees_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_on_fees" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "bank_account_id" UUID,
    "clearing_account_id" UUID,
    "fees_account_id" UUID,
    "journal_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raw_response" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."gateway_fees" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "settlement_id" UUID,
    "gateway_event_id" UUID,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "provider_payment_id" TEXT,
    "fee_type" TEXT NOT NULL DEFAULT 'mdr',
    "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_fees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "storage_path" TEXT NOT NULL,
    "public_url" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "tags" TEXT[],
    "uploaded_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."document_links" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "document_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "linked_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."import_rows" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_index" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "mapped_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "entity_id" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."permission_overrides" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "granted_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_movements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "movement_type" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "movement_date" DATE NOT NULL,
    "qty_in" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_out" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "balance_qty" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "balance_value" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_layers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "unit_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "remaining_qty" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "layer_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_layers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."stock_layer_consumptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "layer_id" UUID NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_layer_consumptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."gst_returns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "return_type" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_taxable_value" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_igst" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_cgst" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_sgst" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_cess" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "itc_igst" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "itc_cgst" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "itc_sgst" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "filed_at" TIMESTAMPTZ(6),
    "filed_by" TEXT,
    "raw_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."delivery_challans" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "challan_number" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "invoice_id" UUID,
    "warehouse_id" UUID,
    "challan_date" DATE NOT NULL,
    "challan_type" TEXT NOT NULL DEFAULT 'supply_on_approval',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference" TEXT,
    "place_of_supply" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_challans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."delivery_challan_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "challan_id" UUID NOT NULL,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "rate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_challan_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikfinance"."gst_reconciliation_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "org_id" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "supplier_gstin" TEXT NOT NULL,
    "supplier_name" TEXT,
    "invoice_number" TEXT,
    "invoice_date" DATE,
    "taxable_value_books" DECIMAL(20,2),
    "tax_books" DECIMAL(20,2),
    "taxable_value_2b" DECIMAL(20,2),
    "tax_2b" DECIMAL(20,2),
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_reconciliation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."employees" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "joiningDate" TEXT,
    "status" "app_quikasset"."AstStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."base_categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "base_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCategoryId" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."assets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "warehouse" TEXT,
    "assetType" TEXT NOT NULL,
    "baseCategoryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "purchaseDate" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "warrantyEndDate" TEXT,
    "description" TEXT NOT NULL,
    "assetStatus" "app_quikasset"."AstAssetStatus" NOT NULL DEFAULT 'Available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."repairs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "issueTitle" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "vendor" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "sentDate" TEXT NOT NULL,
    "expectedReturn" TEXT,
    "returnedDate" TEXT,
    "status" "app_quikasset"."AstRepairStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."replacements" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replacements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."assignments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "expectedReturn" TEXT,
    "notes" TEXT,
    "status" "app_quikasset"."AstAssignmentStatus" NOT NULL DEFAULT 'Active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."fiscal_budgets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "q1Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "q2Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "q3Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "q4Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "fiscal_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."audit_logs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "details" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."AppRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_quikasset"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "custom_field_definitions_org_id_entity_idx" ON "app_quikfinance"."custom_field_definitions"("org_id", "entity");

CREATE INDEX "profiles_org_id_idx" ON "app_quikfinance"."profiles"("org_id");

CREATE UNIQUE INDEX "exchange_rates_org_id_from_currency_to_currency_effective_d_key" ON "app_quikfinance"."exchange_rates"("org_id", "from_currency", "to_currency", "effective_date");

CREATE UNIQUE INDEX "account_categories_org_id_name_key" ON "app_quikfinance"."account_categories"("org_id", "name");

CREATE INDEX "accounts_org_id_account_type_idx" ON "app_quikfinance"."accounts"("org_id", "account_type");

CREATE UNIQUE INDEX "accounts_org_id_code_key" ON "app_quikfinance"."accounts"("org_id", "code");

CREATE INDEX "contacts_org_id_type_idx" ON "app_quikfinance"."contacts"("org_id", "type");

CREATE INDEX "contacts_org_id_customer_category_idx" ON "app_quikfinance"."contacts"("org_id", "customer_category");

CREATE UNIQUE INDEX "contacts_org_id_customer_code_key" ON "app_quikfinance"."contacts"("org_id", "customer_code");

CREATE INDEX "contact_persons_contact_id_idx" ON "app_quikfinance"."contact_persons"("contact_id");

CREATE INDEX "contact_bank_accounts_contact_id_idx" ON "app_quikfinance"."contact_bank_accounts"("contact_id");

CREATE INDEX "contact_documents_contact_id_idx" ON "app_quikfinance"."contact_documents"("contact_id");

CREATE INDEX "contact_emails_contact_id_created_at_idx" ON "app_quikfinance"."contact_emails"("contact_id", "created_at" DESC);

CREATE INDEX "contact_comments_contact_id_created_at_idx" ON "app_quikfinance"."contact_comments"("contact_id", "created_at" DESC);

CREATE INDEX "contact_addresses_contact_id_idx" ON "app_quikfinance"."contact_addresses"("contact_id");

CREATE UNIQUE INDEX "tax_rates_org_id_name_key" ON "app_quikfinance"."tax_rates"("org_id", "name");

CREATE UNIQUE INDEX "items_org_id_sku_key" ON "app_quikfinance"."items"("org_id", "sku");

CREATE INDEX "invoices_org_id_status_idx" ON "app_quikfinance"."invoices"("org_id", "status");

CREATE INDEX "invoices_contact_id_idx" ON "app_quikfinance"."invoices"("contact_id");

CREATE UNIQUE INDEX "invoices_org_id_invoice_number_key" ON "app_quikfinance"."invoices"("org_id", "invoice_number");

CREATE INDEX "bills_org_id_status_idx" ON "app_quikfinance"."bills"("org_id", "status");

CREATE UNIQUE INDEX "bills_org_id_bill_number_key" ON "app_quikfinance"."bills"("org_id", "bill_number");

CREATE INDEX "payments_org_id_payment_date_idx" ON "app_quikfinance"."payments"("org_id", "payment_date");

CREATE INDEX "expenses_org_id_expense_date_idx" ON "app_quikfinance"."expenses"("org_id", "expense_date");

CREATE INDEX "journal_entries_org_id_entry_date_idx" ON "app_quikfinance"."journal_entries"("org_id", "entry_date");

CREATE UNIQUE INDEX "journal_entries_org_id_entry_number_key" ON "app_quikfinance"."journal_entries"("org_id", "entry_number");

CREATE INDEX "journal_entry_lines_journal_entry_id_idx" ON "app_quikfinance"."journal_entry_lines"("journal_entry_id");

CREATE INDEX "bank_transactions_org_id_bank_account_id_idx" ON "app_quikfinance"."bank_transactions"("org_id", "bank_account_id");

CREATE UNIQUE INDEX "fixed_assets_org_id_asset_number_key" ON "app_quikfinance"."fixed_assets"("org_id", "asset_number");

CREATE UNIQUE INDEX "budgets_org_id_name_fiscal_year_key" ON "app_quikfinance"."budgets"("org_id", "name", "fiscal_year");

CREATE INDEX "departments_org_id_idx" ON "app_quikfinance"."departments"("org_id");

CREATE UNIQUE INDEX "departments_org_id_name_key" ON "app_quikfinance"."departments"("org_id", "name");

CREATE UNIQUE INDEX "budget_lines_budget_id_account_id_month_key" ON "app_quikfinance"."budget_lines"("budget_id", "account_id", "month");

CREATE INDEX "audit_logs_org_id_entity_type_entity_id_idx" ON "app_quikfinance"."audit_logs"("org_id", "entity_type", "entity_id");

CREATE INDEX "import_jobs_org_id_created_at_idx" ON "app_quikfinance"."import_jobs"("org_id", "created_at" DESC);

CREATE INDEX "period_locks_org_id_start_date_end_date_idx" ON "app_quikfinance"."period_locks"("org_id", "start_date", "end_date");

CREATE INDEX "ocr_documents_org_id_created_at_idx" ON "app_quikfinance"."ocr_documents"("org_id", "created_at" DESC);

CREATE INDEX "invoice_payment_links_org_id_invoice_id_created_at_idx" ON "app_quikfinance"."invoice_payment_links"("org_id", "invoice_id", "created_at" DESC);

CREATE UNIQUE INDEX "invoice_payment_links_provider_provider_link_id_key" ON "app_quikfinance"."invoice_payment_links"("provider", "provider_link_id");

CREATE UNIQUE INDEX "gateway_events_provider_event_id_key" ON "app_quikfinance"."gateway_events"("provider", "event_id");

CREATE INDEX "quotations_org_id_issue_date_idx" ON "app_quikfinance"."quotations"("org_id", "issue_date" DESC);

CREATE UNIQUE INDEX "quotations_org_id_quotation_number_key" ON "app_quikfinance"."quotations"("org_id", "quotation_number");

CREATE INDEX "quotation_lines_quotation_id_idx" ON "app_quikfinance"."quotation_lines"("quotation_id");

CREATE INDEX "sales_orders_org_id_issue_date_idx" ON "app_quikfinance"."sales_orders"("org_id", "issue_date" DESC);

CREATE UNIQUE INDEX "sales_orders_org_id_sales_order_number_key" ON "app_quikfinance"."sales_orders"("org_id", "sales_order_number");

CREATE INDEX "sales_order_lines_sales_order_id_idx" ON "app_quikfinance"."sales_order_lines"("sales_order_id");

CREATE INDEX "purchase_orders_org_id_issue_date_idx" ON "app_quikfinance"."purchase_orders"("org_id", "issue_date" DESC);

CREATE UNIQUE INDEX "purchase_orders_org_id_purchase_order_number_key" ON "app_quikfinance"."purchase_orders"("org_id", "purchase_order_number");

CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "app_quikfinance"."purchase_order_lines"("purchase_order_id");

CREATE INDEX "credit_notes_org_id_issue_date_idx" ON "app_quikfinance"."credit_notes"("org_id", "issue_date" DESC);

CREATE UNIQUE INDEX "credit_notes_org_id_credit_note_number_key" ON "app_quikfinance"."credit_notes"("org_id", "credit_note_number");

CREATE INDEX "credit_note_lines_credit_note_id_idx" ON "app_quikfinance"."credit_note_lines"("credit_note_id");

CREATE INDEX "vendor_credits_org_id_issue_date_idx" ON "app_quikfinance"."vendor_credits"("org_id", "issue_date" DESC);

CREATE UNIQUE INDEX "vendor_credits_org_id_vendor_credit_number_key" ON "app_quikfinance"."vendor_credits"("org_id", "vendor_credit_number");

CREATE INDEX "vendor_credit_lines_vendor_credit_id_idx" ON "app_quikfinance"."vendor_credit_lines"("vendor_credit_id");

CREATE INDEX "time_entries_org_id_work_date_idx" ON "app_quikfinance"."time_entries"("org_id", "work_date" DESC);

CREATE UNIQUE INDEX "portal_links_access_token_key" ON "app_quikfinance"."portal_links"("access_token");

CREATE INDEX "portal_links_org_id_portal_type_created_at_idx" ON "app_quikfinance"."portal_links"("org_id", "portal_type", "created_at" DESC);

CREATE INDEX "portal_comments_portal_link_id_created_at_idx" ON "app_quikfinance"."portal_comments"("portal_link_id", "created_at" DESC);

CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "app_quikfinance"."support_tickets"("ticket_number");

CREATE INDEX "support_tickets_org_id_status_created_at_idx" ON "app_quikfinance"."support_tickets"("org_id", "status", "created_at" DESC);

CREATE UNIQUE INDEX "payment_terms_org_id_name_key" ON "app_quikfinance"."payment_terms"("org_id", "name");

CREATE INDEX "pdf_templates_org_id_module_idx" ON "app_quikfinance"."pdf_templates"("org_id", "module");

CREATE UNIQUE INDEX "tds_rates_org_id_name_key" ON "app_quikfinance"."tds_rates"("org_id", "name");

CREATE UNIQUE INDEX "gstins_org_id_gstin_key" ON "app_quikfinance"."gstins"("org_id", "gstin");

CREATE UNIQUE INDEX "transaction_series_org_id_name_key" ON "app_quikfinance"."transaction_series"("org_id", "name");

CREATE UNIQUE INDEX "warehouses_org_id_code_key" ON "app_quikfinance"."warehouses"("org_id", "code");

CREATE UNIQUE INDEX "stock_adjustments_org_id_adjustment_number_key" ON "app_quikfinance"."stock_adjustments"("org_id", "adjustment_number");

CREATE UNIQUE INDEX "stock_transfers_org_id_transfer_number_key" ON "app_quikfinance"."stock_transfers"("org_id", "transfer_number");

CREATE INDEX "goods_receipts_org_id_receipt_date_idx" ON "app_quikfinance"."goods_receipts"("org_id", "receipt_date" DESC);

CREATE INDEX "goods_receipts_purchase_order_id_idx" ON "app_quikfinance"."goods_receipts"("purchase_order_id");

CREATE UNIQUE INDEX "goods_receipts_org_id_grn_number_key" ON "app_quikfinance"."goods_receipts"("org_id", "grn_number");

CREATE INDEX "approval_requests_org_id_status_created_at_idx" ON "app_quikfinance"."approval_requests"("org_id", "status", "created_at" DESC);

CREATE INDEX "approval_requests_entity_type_entity_id_idx" ON "app_quikfinance"."approval_requests"("entity_type", "entity_id");

CREATE INDEX "bank_rules_org_id_is_active_priority_idx" ON "app_quikfinance"."bank_rules"("org_id", "is_active", "priority");

CREATE INDEX "gateway_settlements_org_id_settlement_date_idx" ON "app_quikfinance"."gateway_settlements"("org_id", "settlement_date" DESC);

CREATE UNIQUE INDEX "gateway_settlements_provider_provider_settlement_id_key" ON "app_quikfinance"."gateway_settlements"("provider", "provider_settlement_id");

CREATE INDEX "gateway_fees_settlement_id_idx" ON "app_quikfinance"."gateway_fees"("settlement_id");

CREATE INDEX "documents_org_id_category_created_at_idx" ON "app_quikfinance"."documents"("org_id", "category", "created_at" DESC);

CREATE INDEX "document_links_entity_type_entity_id_idx" ON "app_quikfinance"."document_links"("entity_type", "entity_id");

CREATE INDEX "import_rows_import_job_id_status_idx" ON "app_quikfinance"."import_rows"("import_job_id", "status");

CREATE UNIQUE INDEX "permission_overrides_org_id_user_id_module_action_key" ON "app_quikfinance"."permission_overrides"("org_id", "user_id", "module", "action");

CREATE INDEX "stock_movements_org_id_item_id_movement_date_idx" ON "app_quikfinance"."stock_movements"("org_id", "item_id", "movement_date" DESC);

CREATE INDEX "stock_movements_warehouse_id_movement_date_idx" ON "app_quikfinance"."stock_movements"("warehouse_id", "movement_date" DESC);

CREATE INDEX "stock_layers_org_id_item_id_layer_date_idx" ON "app_quikfinance"."stock_layers"("org_id", "item_id", "layer_date");

CREATE INDEX "stock_layer_consumptions_org_id_ref_type_ref_id_idx" ON "app_quikfinance"."stock_layer_consumptions"("org_id", "ref_type", "ref_id");

CREATE INDEX "stock_layer_consumptions_layer_id_idx" ON "app_quikfinance"."stock_layer_consumptions"("layer_id");

CREATE INDEX "gst_returns_org_id_return_type_period_year_period_month_idx" ON "app_quikfinance"."gst_returns"("org_id", "return_type", "period_year", "period_month");

CREATE UNIQUE INDEX "gst_returns_org_id_return_type_period_month_period_year_key" ON "app_quikfinance"."gst_returns"("org_id", "return_type", "period_month", "period_year");

CREATE INDEX "delivery_challans_org_id_challan_date_idx" ON "app_quikfinance"."delivery_challans"("org_id", "challan_date" DESC);

CREATE INDEX "delivery_challans_contact_id_idx" ON "app_quikfinance"."delivery_challans"("contact_id");

CREATE UNIQUE INDEX "delivery_challans_org_id_challan_number_key" ON "app_quikfinance"."delivery_challans"("org_id", "challan_number");

CREATE INDEX "delivery_challan_lines_challan_id_idx" ON "app_quikfinance"."delivery_challan_lines"("challan_id");

CREATE INDEX "gst_reconciliation_items_org_id_period_year_period_month_idx" ON "app_quikfinance"."gst_reconciliation_items"("org_id", "period_year", "period_month");

CREATE INDEX "employees_orgId_idx" ON "app_quikasset"."employees"("orgId");

CREATE UNIQUE INDEX "employees_orgId_employeeId_key" ON "app_quikasset"."employees"("orgId", "employeeId");

CREATE UNIQUE INDEX "employees_orgId_email_key" ON "app_quikasset"."employees"("orgId", "email");

CREATE INDEX "base_categories_orgId_idx" ON "app_quikasset"."base_categories"("orgId");

CREATE UNIQUE INDEX "base_categories_orgId_name_key" ON "app_quikasset"."base_categories"("orgId", "name");

CREATE INDEX "categories_orgId_idx" ON "app_quikasset"."categories"("orgId");

CREATE INDEX "categories_baseCategoryId_idx" ON "app_quikasset"."categories"("baseCategoryId");

CREATE UNIQUE INDEX "categories_orgId_name_baseCategoryId_key" ON "app_quikasset"."categories"("orgId", "name", "baseCategoryId");

CREATE INDEX "assets_orgId_idx" ON "app_quikasset"."assets"("orgId");

CREATE INDEX "assets_orgId_assetStatus_idx" ON "app_quikasset"."assets"("orgId", "assetStatus");

CREATE INDEX "assets_baseCategoryId_idx" ON "app_quikasset"."assets"("baseCategoryId");

CREATE INDEX "assets_categoryId_idx" ON "app_quikasset"."assets"("categoryId");

CREATE UNIQUE INDEX "assets_orgId_itemCode_key" ON "app_quikasset"."assets"("orgId", "itemCode");

CREATE UNIQUE INDEX "assets_orgId_serialNumber_key" ON "app_quikasset"."assets"("orgId", "serialNumber");

CREATE INDEX "repairs_orgId_idx" ON "app_quikasset"."repairs"("orgId");

CREATE INDEX "repairs_assetId_idx" ON "app_quikasset"."repairs"("assetId");

CREATE INDEX "replacements_orgId_idx" ON "app_quikasset"."replacements"("orgId");

CREATE INDEX "replacements_repairId_idx" ON "app_quikasset"."replacements"("repairId");

CREATE INDEX "replacements_assetId_idx" ON "app_quikasset"."replacements"("assetId");

CREATE INDEX "replacements_userId_idx" ON "app_quikasset"."replacements"("userId");

CREATE INDEX "assignments_orgId_idx" ON "app_quikasset"."assignments"("orgId");

CREATE INDEX "assignments_assetId_idx" ON "app_quikasset"."assignments"("assetId");

CREATE INDEX "assignments_userId_idx" ON "app_quikasset"."assignments"("userId");

CREATE INDEX "fiscal_budgets_orgId_idx" ON "app_quikasset"."fiscal_budgets"("orgId");

CREATE UNIQUE INDEX "fiscal_budgets_orgId_fiscalYear_key" ON "app_quikasset"."fiscal_budgets"("orgId", "fiscalYear");

CREATE INDEX "audit_logs_orgId_idx" ON "app_quikasset"."audit_logs"("orgId");

CREATE INDEX "audit_logs_orgId_createdAt_idx" ON "app_quikasset"."audit_logs"("orgId", "createdAt");

CREATE INDEX "audit_logs_orgId_module_idx" ON "app_quikasset"."audit_logs"("orgId", "module");

CREATE INDEX "AppRole_orgId_appId_idx" ON "app_quikasset"."AppRole"("orgId", "appId");

CREATE UNIQUE INDEX "AppRole_orgId_appId_name_key" ON "app_quikasset"."AppRole"("orgId", "appId", "name");

CREATE INDEX "RolePermission_roleId_idx" ON "app_quikasset"."RolePermission"("roleId");

CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_key" ON "app_quikasset"."RolePermission"("roleId", "resource", "action");

CREATE INDEX "RoleNavigation_roleId_idx" ON "app_quikasset"."RoleNavigation"("roleId");

CREATE UNIQUE INDEX "RoleNavigation_roleId_navKey_key" ON "app_quikasset"."RoleNavigation"("roleId", "navKey");

CREATE INDEX "UserAppRole_roleId_idx" ON "app_quikasset"."UserAppRole"("roleId");

CREATE INDEX "UserAppRole_userId_orgId_idx" ON "app_quikasset"."UserAppRole"("userId", "orgId");

CREATE UNIQUE INDEX "UserAppRole_userId_orgId_roleId_key" ON "app_quikasset"."UserAppRole"("userId", "orgId", "roleId");

CREATE INDEX "UserPermissionExtra_userId_orgId_idx" ON "app_quikasset"."UserPermissionExtra"("userId", "orgId");

CREATE UNIQUE INDEX "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quikasset"."UserPermissionExtra"("orgId", "userId", "resource", "action");

ALTER TABLE "app_quikfinance"."contact_persons" ADD CONSTRAINT "contact_persons_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app_quikfinance"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikfinance"."contact_bank_accounts" ADD CONSTRAINT "contact_bank_accounts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app_quikfinance"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikfinance"."contact_documents" ADD CONSTRAINT "contact_documents_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app_quikfinance"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikfinance"."contact_emails" ADD CONSTRAINT "contact_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app_quikfinance"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikfinance"."contact_comments" ADD CONSTRAINT "contact_comments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app_quikfinance"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikfinance"."contact_addresses" ADD CONSTRAINT "contact_addresses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app_quikfinance"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikfinance"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "app_quikfinance"."journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."categories" ADD CONSTRAINT "categories_baseCategoryId_fkey" FOREIGN KEY ("baseCategoryId") REFERENCES "app_quikasset"."base_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assets" ADD CONSTRAINT "assets_baseCategoryId_fkey" FOREIGN KEY ("baseCategoryId") REFERENCES "app_quikasset"."base_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_quikasset"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."repairs" ADD CONSTRAINT "repairs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."replacements" ADD CONSTRAINT "replacements_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "app_quikasset"."repairs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."replacements" ADD CONSTRAINT "replacements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."replacements" ADD CONSTRAINT "replacements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikasset"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assignments" ADD CONSTRAINT "assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "app_quikasset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."assignments" ADD CONSTRAINT "assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_quikasset"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikasset"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikasset"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikasset"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikasset"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
