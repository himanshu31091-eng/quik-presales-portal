--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_quiktrack; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA app_quiktrack;



SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: QtDashboard; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtDashboard" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "userId" text NOT NULL,
    "dashboardKey" text NOT NULL,
    config jsonb NOT NULL,
    starred boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtDoc; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtDoc" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "projectId" text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    "templateKey" text,
    "createdBy" text,
    "updatedBy" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtInvitation; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtInvitation" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    email text NOT NULL,
    "projectId" text,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    token text NOT NULL,
    "invitedBy" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtIssue; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtIssue" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "projectId" text NOT NULL,
    key text NOT NULL,
    title text NOT NULL,
    description text,
    type text DEFAULT 'TASK'::text NOT NULL,
    "statusId" text NOT NULL,
    priority text DEFAULT 'MEDIUM'::text NOT NULL,
    "parentId" text,
    "epicId" text,
    "sprintId" text,
    "assigneeId" text,
    "reporterId" text,
    "startDate" timestamp(3) without time zone,
    "dueDate" timestamp(3) without time zone,
    eta double precision,
    "storyPoints" integer,
    "orderInColumn" integer DEFAULT 0 NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdBy" text,
    "updatedBy" text
);



--
-- Name: QtIssueComment; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtIssueComment" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "projectId" text NOT NULL,
    "issueId" text NOT NULL,
    "userId" text NOT NULL,
    body text NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "editedAt" timestamp(3) without time zone
);



--
-- Name: QtIssueHistory; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtIssueHistory" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "projectId" text NOT NULL,
    "issueId" text NOT NULL,
    "userId" text,
    field text NOT NULL,
    "oldValue" text,
    "newValue" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);



--
-- Name: QtIssueLink; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtIssueLink" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "projectId" text NOT NULL,
    "sourceIssueId" text NOT NULL,
    "targetIssueId" text NOT NULL,
    type text DEFAULT 'RELATES_TO'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdBy" text
);



--
-- Name: QtIssueStatus; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtIssueStatus" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#94a3b8'::text NOT NULL,
    category text DEFAULT 'BACKLOG'::text NOT NULL,
    "orderIndex" integer DEFAULT 0 NOT NULL,
    "isHidden" boolean DEFAULT false NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtIssueType; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtIssueType" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#64748b'::text NOT NULL,
    icon text,
    "orderIndex" integer DEFAULT 0 NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtNotificationPref; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtNotificationPref" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "eventKey" text NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtPage; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtPage" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    "authorId" text NOT NULL,
    "parentPageId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdBy" text,
    "updatedBy" text
);



--
-- Name: QtProject; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtProject" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "projectKey" text NOT NULL,
    name text NOT NULL,
    description text,
    "projectType" text DEFAULT 'software'::text NOT NULL,
    icon text,
    color text DEFAULT '#2563eb'::text,
    status text DEFAULT 'active'::text NOT NULL,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    "leadUserId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdBy" text,
    "updatedBy" text
);



--
-- Name: QtProjectMember; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtProjectMember" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "userId" text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    "invitedBy" text,
    "joinedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtProjectTeam; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtProjectTeam" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "teamId" text NOT NULL,
    "addedBy" text,
    "addedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);



--
-- Name: QtSprint; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtSprint" (
    id text NOT NULL,
    "projectId" text NOT NULL,
    name text NOT NULL,
    goal text,
    status text DEFAULT 'PLANNING'::text NOT NULL,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdBy" text,
    "updatedBy" text
);



--
-- Name: QtTeam; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtTeam" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#2563eb'::text,
    "leadUserId" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdBy" text,
    "updatedBy" text
);



--
-- Name: QtTeamMember; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtTeamMember" (
    id text NOT NULL,
    "teamId" text NOT NULL,
    "userId" text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    "joinedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtTimesheetEntry; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtTimesheetEntry" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "userId" text NOT NULL,
    "projectId" text NOT NULL,
    "issueId" text NOT NULL,
    "parentIssueId" text,
    "entryDate" timestamp(3) without time zone NOT NULL,
    hours double precision NOT NULL,
    description text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdBy" text,
    "updatedBy" text
);



--
-- Name: QtTimesheetWeeklySummary; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtTimesheetWeeklySummary" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "issueId" text NOT NULL,
    "userId" text NOT NULL,
    year integer NOT NULL,
    "weekNumber" integer NOT NULL,
    "totalHours" double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Name: QtUserActivity; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtUserActivity" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "userId" text NOT NULL,
    "projectId" text NOT NULL,
    kind text NOT NULL,
    ref text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    meta text,
    href text NOT NULL,
    icon text,
    color text,
    "viewedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);



--
-- Name: QtUserViewPref; Type: TABLE; Schema: app_quiktrack; Owner: postgres
--

CREATE TABLE app_quiktrack."QtUserViewPref" (
    id text NOT NULL,
    "orgId" text NOT NULL,
    "userId" text NOT NULL,
    "projectId" text,
    "viewKey" text NOT NULL,
    "hiddenColumns" text[] DEFAULT ARRAY[]::text[],
    "columnOrder" text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);



--
-- Data for Name: QtDashboard; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtDoc; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtInvitation; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtIssue; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtIssueComment; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtIssueHistory; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtIssueLink; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtIssueStatus; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtIssueType; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtNotificationPref; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtPage; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtProject; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtProjectMember; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtProjectTeam; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtSprint; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtTeam; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtTeamMember; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtTimesheetEntry; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtTimesheetWeeklySummary; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtUserActivity; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Data for Name: QtUserViewPref; Type: TABLE DATA; Schema: app_quiktrack; Owner: postgres
--



--
-- Name: QtDashboard QtDashboard_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtDashboard"
    ADD CONSTRAINT "QtDashboard_pkey" PRIMARY KEY (id);


--
-- Name: QtDoc QtDoc_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtDoc"
    ADD CONSTRAINT "QtDoc_pkey" PRIMARY KEY (id);


--
-- Name: QtInvitation QtInvitation_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtInvitation"
    ADD CONSTRAINT "QtInvitation_pkey" PRIMARY KEY (id);


--
-- Name: QtIssueComment QtIssueComment_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueComment"
    ADD CONSTRAINT "QtIssueComment_pkey" PRIMARY KEY (id);


--
-- Name: QtIssueHistory QtIssueHistory_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueHistory"
    ADD CONSTRAINT "QtIssueHistory_pkey" PRIMARY KEY (id);


--
-- Name: QtIssueLink QtIssueLink_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueLink"
    ADD CONSTRAINT "QtIssueLink_pkey" PRIMARY KEY (id);


--
-- Name: QtIssueStatus QtIssueStatus_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueStatus"
    ADD CONSTRAINT "QtIssueStatus_pkey" PRIMARY KEY (id);


--
-- Name: QtIssueType QtIssueType_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueType"
    ADD CONSTRAINT "QtIssueType_pkey" PRIMARY KEY (id);


--
-- Name: QtIssue QtIssue_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_pkey" PRIMARY KEY (id);


--
-- Name: QtNotificationPref QtNotificationPref_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtNotificationPref"
    ADD CONSTRAINT "QtNotificationPref_pkey" PRIMARY KEY (id);


--
-- Name: QtPage QtPage_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtPage"
    ADD CONSTRAINT "QtPage_pkey" PRIMARY KEY (id);


--
-- Name: QtProjectMember QtProjectMember_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProjectMember"
    ADD CONSTRAINT "QtProjectMember_pkey" PRIMARY KEY (id);


--
-- Name: QtProjectTeam QtProjectTeam_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProjectTeam"
    ADD CONSTRAINT "QtProjectTeam_pkey" PRIMARY KEY (id);


--
-- Name: QtProject QtProject_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProject"
    ADD CONSTRAINT "QtProject_pkey" PRIMARY KEY (id);


--
-- Name: QtSprint QtSprint_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtSprint"
    ADD CONSTRAINT "QtSprint_pkey" PRIMARY KEY (id);


--
-- Name: QtTeamMember QtTeamMember_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTeamMember"
    ADD CONSTRAINT "QtTeamMember_pkey" PRIMARY KEY (id);


--
-- Name: QtTeam QtTeam_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTeam"
    ADD CONSTRAINT "QtTeam_pkey" PRIMARY KEY (id);


--
-- Name: QtTimesheetEntry QtTimesheetEntry_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTimesheetEntry"
    ADD CONSTRAINT "QtTimesheetEntry_pkey" PRIMARY KEY (id);


--
-- Name: QtTimesheetWeeklySummary QtTimesheetWeeklySummary_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTimesheetWeeklySummary"
    ADD CONSTRAINT "QtTimesheetWeeklySummary_pkey" PRIMARY KEY (id);


--
-- Name: QtUserActivity QtUserActivity_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtUserActivity"
    ADD CONSTRAINT "QtUserActivity_pkey" PRIMARY KEY (id);


--
-- Name: QtUserViewPref QtUserViewPref_pkey; Type: CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtUserViewPref"
    ADD CONSTRAINT "QtUserViewPref_pkey" PRIMARY KEY (id);


--
-- Name: QtDashboard_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtDashboard_orgId_idx" ON app_quiktrack."QtDashboard" USING btree ("orgId");


--
-- Name: QtDashboard_userId_dashboardKey_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtDashboard_userId_dashboardKey_key" ON app_quiktrack."QtDashboard" USING btree ("userId", "dashboardKey");


--
-- Name: QtDoc_projectId_isDeleted_updatedAt_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtDoc_projectId_isDeleted_updatedAt_idx" ON app_quiktrack."QtDoc" USING btree ("projectId", "isDeleted", "updatedAt");


--
-- Name: QtDoc_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtDoc_orgId_idx" ON app_quiktrack."QtDoc" USING btree ("orgId");


--
-- Name: QtInvitation_orgId_email_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtInvitation_orgId_email_idx" ON app_quiktrack."QtInvitation" USING btree ("orgId", email);


--
-- Name: QtInvitation_token_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtInvitation_token_idx" ON app_quiktrack."QtInvitation" USING btree (token);


--
-- Name: QtInvitation_token_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtInvitation_token_key" ON app_quiktrack."QtInvitation" USING btree (token);


--
-- Name: QtIssueComment_issueId_createdAt_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueComment_issueId_createdAt_idx" ON app_quiktrack."QtIssueComment" USING btree ("issueId", "createdAt");


--
-- Name: QtIssueComment_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueComment_orgId_idx" ON app_quiktrack."QtIssueComment" USING btree ("orgId");


--
-- Name: QtIssueHistory_issueId_createdAt_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueHistory_issueId_createdAt_idx" ON app_quiktrack."QtIssueHistory" USING btree ("issueId", "createdAt");


--
-- Name: QtIssueHistory_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueHistory_orgId_idx" ON app_quiktrack."QtIssueHistory" USING btree ("orgId");


--
-- Name: QtIssueLink_projectId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueLink_projectId_idx" ON app_quiktrack."QtIssueLink" USING btree ("projectId");


--
-- Name: QtIssueLink_sourceIssueId_targetIssueId_type_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtIssueLink_sourceIssueId_targetIssueId_type_key" ON app_quiktrack."QtIssueLink" USING btree ("sourceIssueId", "targetIssueId", type);


--
-- Name: QtIssueLink_targetIssueId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueLink_targetIssueId_idx" ON app_quiktrack."QtIssueLink" USING btree ("targetIssueId");


--
-- Name: QtIssueLink_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueLink_orgId_idx" ON app_quiktrack."QtIssueLink" USING btree ("orgId");


--
-- Name: QtIssueStatus_projectId_name_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtIssueStatus_projectId_name_key" ON app_quiktrack."QtIssueStatus" USING btree ("projectId", name);


--
-- Name: QtIssueStatus_projectId_orderIndex_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssueStatus_projectId_orderIndex_idx" ON app_quiktrack."QtIssueStatus" USING btree ("projectId", "orderIndex");


--
-- Name: QtIssueType_projectId_name_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtIssueType_projectId_name_key" ON app_quiktrack."QtIssueType" USING btree ("projectId", name);


--
-- Name: QtIssue_assigneeId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_assigneeId_idx" ON app_quiktrack."QtIssue" USING btree ("assigneeId");


--
-- Name: QtIssue_epicId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_epicId_idx" ON app_quiktrack."QtIssue" USING btree ("epicId");


--
-- Name: QtIssue_parentId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_parentId_idx" ON app_quiktrack."QtIssue" USING btree ("parentId");


--
-- Name: QtIssue_projectId_key_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtIssue_projectId_key_key" ON app_quiktrack."QtIssue" USING btree ("projectId", key);


--
-- Name: QtIssue_projectId_statusId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_projectId_statusId_idx" ON app_quiktrack."QtIssue" USING btree ("projectId", "statusId");


--
-- Name: QtIssue_projectId_type_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_projectId_type_idx" ON app_quiktrack."QtIssue" USING btree ("projectId", type);


--
-- Name: QtIssue_sprintId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_sprintId_idx" ON app_quiktrack."QtIssue" USING btree ("sprintId");


--
-- Name: QtIssue_startDate_dueDate_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_startDate_dueDate_idx" ON app_quiktrack."QtIssue" USING btree ("startDate", "dueDate");


--
-- Name: QtIssue_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtIssue_orgId_idx" ON app_quiktrack."QtIssue" USING btree ("orgId");


--
-- Name: QtNotificationPref_userId_eventKey_channel_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtNotificationPref_userId_eventKey_channel_key" ON app_quiktrack."QtNotificationPref" USING btree ("userId", "eventKey", channel);


--
-- Name: QtNotificationPref_userId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtNotificationPref_userId_idx" ON app_quiktrack."QtNotificationPref" USING btree ("userId");


--
-- Name: QtPage_authorId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtPage_authorId_idx" ON app_quiktrack."QtPage" USING btree ("authorId");


--
-- Name: QtPage_projectId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtPage_projectId_idx" ON app_quiktrack."QtPage" USING btree ("projectId");


--
-- Name: QtProjectMember_projectId_role_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtProjectMember_projectId_role_idx" ON app_quiktrack."QtProjectMember" USING btree ("projectId", role);


--
-- Name: QtProjectMember_projectId_userId_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtProjectMember_projectId_userId_key" ON app_quiktrack."QtProjectMember" USING btree ("projectId", "userId");


--
-- Name: QtProjectMember_userId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtProjectMember_userId_idx" ON app_quiktrack."QtProjectMember" USING btree ("userId");


--
-- Name: QtProjectTeam_projectId_teamId_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtProjectTeam_projectId_teamId_key" ON app_quiktrack."QtProjectTeam" USING btree ("projectId", "teamId");


--
-- Name: QtProjectTeam_teamId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtProjectTeam_teamId_idx" ON app_quiktrack."QtProjectTeam" USING btree ("teamId");


--
-- Name: QtProject_leadUserId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtProject_leadUserId_idx" ON app_quiktrack."QtProject" USING btree ("leadUserId");


--
-- Name: QtProject_orgId_projectKey_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtProject_orgId_projectKey_key" ON app_quiktrack."QtProject" USING btree ("orgId", "projectKey");


--
-- Name: QtProject_orgId_status_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtProject_orgId_status_idx" ON app_quiktrack."QtProject" USING btree ("orgId", status);


--
-- Name: QtSprint_projectId_status_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtSprint_projectId_status_idx" ON app_quiktrack."QtSprint" USING btree ("projectId", status);


--
-- Name: QtTeamMember_teamId_userId_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtTeamMember_teamId_userId_key" ON app_quiktrack."QtTeamMember" USING btree ("teamId", "userId");


--
-- Name: QtTeamMember_userId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTeamMember_userId_idx" ON app_quiktrack."QtTeamMember" USING btree ("userId");


--
-- Name: QtTeam_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTeam_orgId_idx" ON app_quiktrack."QtTeam" USING btree ("orgId");


--
-- Name: QtTeam_orgId_name_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtTeam_orgId_name_key" ON app_quiktrack."QtTeam" USING btree ("orgId", name);


--
-- Name: QtTimesheetEntry_issueId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTimesheetEntry_issueId_idx" ON app_quiktrack."QtTimesheetEntry" USING btree ("issueId");


--
-- Name: QtTimesheetEntry_projectId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTimesheetEntry_projectId_idx" ON app_quiktrack."QtTimesheetEntry" USING btree ("projectId");


--
-- Name: QtTimesheetEntry_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTimesheetEntry_orgId_idx" ON app_quiktrack."QtTimesheetEntry" USING btree ("orgId");


--
-- Name: QtTimesheetEntry_userId_entryDate_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTimesheetEntry_userId_entryDate_idx" ON app_quiktrack."QtTimesheetEntry" USING btree ("userId", "entryDate");


--
-- Name: QtTimesheetWeeklySummary_issueId_userId_year_weekNumber_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtTimesheetWeeklySummary_issueId_userId_year_weekNumber_key" ON app_quiktrack."QtTimesheetWeeklySummary" USING btree ("issueId", "userId", year, "weekNumber");


--
-- Name: QtTimesheetWeeklySummary_orgId_year_weekNumber_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtTimesheetWeeklySummary_orgId_year_weekNumber_idx" ON app_quiktrack."QtTimesheetWeeklySummary" USING btree ("orgId", year, "weekNumber");


--
-- Name: QtUserActivity_orgId_userId_viewedAt_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtUserActivity_orgId_userId_viewedAt_idx" ON app_quiktrack."QtUserActivity" USING btree ("orgId", "userId", "viewedAt");


--
-- Name: QtUserActivity_userId_projectId_kind_ref_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtUserActivity_userId_projectId_kind_ref_key" ON app_quiktrack."QtUserActivity" USING btree ("userId", "projectId", kind, ref);


--
-- Name: QtUserViewPref_orgId_idx; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE INDEX "QtUserViewPref_orgId_idx" ON app_quiktrack."QtUserViewPref" USING btree ("orgId");


--
-- Name: QtUserViewPref_userId_projectId_viewKey_key; Type: INDEX; Schema: app_quiktrack; Owner: postgres
--

CREATE UNIQUE INDEX "QtUserViewPref_userId_projectId_viewKey_key" ON app_quiktrack."QtUserViewPref" USING btree ("userId", "projectId", "viewKey");


--
-- Name: QtDashboard QtDashboard_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtDashboard"
    ADD CONSTRAINT "QtDashboard_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtDoc QtDoc_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtDoc"
    ADD CONSTRAINT "QtDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtDoc QtDoc_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtDoc"
    ADD CONSTRAINT "QtDoc_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtInvitation QtInvitation_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtInvitation"
    ADD CONSTRAINT "QtInvitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssueComment QtIssueComment_issueId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueComment"
    ADD CONSTRAINT "QtIssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssueHistory QtIssueHistory_issueId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueHistory"
    ADD CONSTRAINT "QtIssueHistory_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssueLink QtIssueLink_sourceIssueId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueLink"
    ADD CONSTRAINT "QtIssueLink_sourceIssueId_fkey" FOREIGN KEY ("sourceIssueId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssueLink QtIssueLink_targetIssueId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueLink"
    ADD CONSTRAINT "QtIssueLink_targetIssueId_fkey" FOREIGN KEY ("targetIssueId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssueStatus QtIssueStatus_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueStatus"
    ADD CONSTRAINT "QtIssueStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssueType QtIssueType_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssueType"
    ADD CONSTRAINT "QtIssueType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssue QtIssue_epicId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QtIssue QtIssue_parentId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QtIssue QtIssue_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtIssue QtIssue_sprintId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES app_quiktrack."QtSprint"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QtIssue QtIssue_statusId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES app_quiktrack."QtIssueStatus"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: QtIssue QtIssue_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtIssue"
    ADD CONSTRAINT "QtIssue_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtPage QtPage_parentPageId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtPage"
    ADD CONSTRAINT "QtPage_parentPageId_fkey" FOREIGN KEY ("parentPageId") REFERENCES app_quiktrack."QtPage"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QtPage QtPage_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtPage"
    ADD CONSTRAINT "QtPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtProjectMember QtProjectMember_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProjectMember"
    ADD CONSTRAINT "QtProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtProjectTeam QtProjectTeam_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProjectTeam"
    ADD CONSTRAINT "QtProjectTeam_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtProjectTeam QtProjectTeam_teamId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProjectTeam"
    ADD CONSTRAINT "QtProjectTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES app_quiktrack."QtTeam"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtProject QtProject_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtProject"
    ADD CONSTRAINT "QtProject_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtSprint QtSprint_projectId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtSprint"
    ADD CONSTRAINT "QtSprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtTeamMember QtTeamMember_teamId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTeamMember"
    ADD CONSTRAINT "QtTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES app_quiktrack."QtTeam"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtTeam QtTeam_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTeam"
    ADD CONSTRAINT "QtTeam_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtTimesheetEntry QtTimesheetEntry_issueId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTimesheetEntry"
    ADD CONSTRAINT "QtTimesheetEntry_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES app_quiktrack."QtIssue"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtTimesheetEntry QtTimesheetEntry_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtTimesheetEntry"
    ADD CONSTRAINT "QtTimesheetEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtUserActivity QtUserActivity_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtUserActivity"
    ADD CONSTRAINT "QtUserActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QtUserViewPref QtUserViewPref_orgId_fkey; Type: FK CONSTRAINT; Schema: app_quiktrack; Owner: postgres
--

ALTER TABLE ONLY app_quiktrack."QtUserViewPref"
    ADD CONSTRAINT "QtUserViewPref_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


