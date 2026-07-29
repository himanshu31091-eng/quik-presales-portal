-- Pattern A: schema-per-app, non-destructive table moves.
CREATE SCHEMA IF NOT EXISTS app_quikscale;
CREATE SCHEMA IF NOT EXISTS app_quikinfra;

-- Quikscale tables
ALTER TABLE IF EXISTS public."AccountabilityFunction" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."KPI" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."KPIWeeklyValue" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."KPINote" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."KPILog" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."Priority" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."PriorityWeeklyStatus" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."WWWItem" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."WWWRevisionLog" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."CategoryMaster" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."QuarterSetting" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."HabitAssessment" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."Client" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientTeamMember" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientMembership" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientMember" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientDailyHuddle" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientDailyHuddleAbsence" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientDailyHuddleTeamAbsence" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientWeeklyMeeting" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientWeeklyMeetingAbsence" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientWeeklyMeetingDashboardNA" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."ClientWeeklyMemberScore" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."OPSPData" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."OPSPReviewEntry" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."OPSPDocument" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."OPSPSection" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."OPSPPlan" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."PerformanceReview" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."TalentAssessment" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."Goal" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."OneOnOne" SET SCHEMA app_quikscale;
ALTER TABLE IF EXISTS public."FeedbackEntry" SET SCHEMA app_quikscale;

-- Quikscale enums (PostgreSQL has no ALTER TYPE IF EXISTS)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public' AND t.typname = 'ClientMeetingFlag') THEN
    ALTER TYPE public."ClientMeetingFlag" SET SCHEMA app_quikscale;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public' AND t.typname = 'ClientMeetingStatus') THEN
    ALTER TYPE public."ClientMeetingStatus" SET SCHEMA app_quikscale;
  END IF;
END $$;

-- Quikconstruction tables
ALTER TABLE IF EXISTS public."CnCompany" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnVendor" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnCustomer" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnContractor" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnUOM" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnItemGroup" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnItem" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnBank" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDepartment" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnWorkCategory" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnCostCenter" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnLocation" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnGSTCode" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnTDSCode" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnTermsCondition" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnFinancialYear" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnProject" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnMachinery" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnAsset" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPurchaseRequisition" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPurchaseRequisitionLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPurchaseOrder" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPurchaseOrderLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnGoodsReceiptNote" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnGRNLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnStockLedger" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnMaterialIssue" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnMaterialIssueLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPurchaseIndent" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPurchaseIndentLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnRFQ" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnRFQLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnRFQVendor" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnGatePass" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnGoodReturn" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnGoodReturnLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnInternalReturn" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnInternalReturnLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnStockTransfer" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnStockTransferLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnStockReconciliation" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnStockReconciliationLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDieselLog" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnBOQ" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnBOQItem" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDPR" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDPRMaterial" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDPRLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnHindrance" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnEstimation" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnEstimationItem" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnWorkOrder" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnWorkOrderLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnRAB" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnRABLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnClientInvoice" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnClientReceipt" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnClientReceiptAllocation" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnVendorBill" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnVendorPayment" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnVendorPaymentAllocation" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnEmployee" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnAttendance" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPayroll" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnPayrollLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnQCInspection" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnQCDefect" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnSafetyIncident" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnSafetyChecklist" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDocument" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnExpense" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnClientInvoiceLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnVendorBillLine" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnCreditNote" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnDebitNote" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnAuditLog" SET SCHEMA app_quikinfra;
ALTER TABLE IF EXISTS public."CnNumberSequence" SET SCHEMA app_quikinfra;
