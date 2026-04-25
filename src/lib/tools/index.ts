// ---------------------------------------------------------------------------
// Klawhub Agent System — Tool Index
// ---------------------------------------------------------------------------
// Aggregates all tool modules into the allTools record.
// Each module exports individual tool constants.
// ---------------------------------------------------------------------------

import type { ToolType } from "./shared";
import { setCurrentAgentId, withAgentContext, getCurrentAgentId } from "./shared";
export { setCurrentAgentId, withAgentContext, getCurrentAgentId };
import {
  gmailSendTool, gmailFetchTool, gmailLabelsTool, gmailCreateLabelTool,
  gmailDeleteLabelTool, gmailProfileTool, gmailReplyTool, gmailThreadTool,
  gmailBatchTool, gmailSendWithAttachmentTool,
} from "./gmail";

import {
  calendarListTool, calendarEventsTool, calendarCreateTool,
  calendarUpdateTool, calendarDeleteTool, calendarFreebusyTool,
} from "./calendar";

import {
  driveListTool, driveCreateFolderTool, driveCreateFileTool,
  downloadDriveFileTool,
} from "./drive";

import {
  sheetsReadTool, sheetsValuesTool, sheetsAppendTool, sheetsUpdateTool,
  sheetsCreateTool, sheetsAddSheetTool, sheetsBatchGetTool, sheetsClearTool,
} from "./sheets";

import {
  docsListTool, docsReadTool, docsCreateTool, docsAppendTool,
} from "./docs";

import {
  githubRepoTool, githubIssuesTool, githubCreateIssueTool, githubPrsTool,
  githubCommitsTool, githubFilesTool, githubReadFileTool, githubSearchTool,
  githubBranchesTool, githubUpdateIssueTool, githubCreatePrTool,
  githubPrReviewTool, githubPrCommentTool, githubCreateBranchTool,
} from "./github";

import {
  vercelProjectsTool, vercelDeploymentsTool, vercelDomainsTool,
  vercelDeployTool, vercelLogsTool,
} from "./vercel";

import {
  visionAnalyzeTool, visionDownloadAnalyzeTool,
} from "./vision";

import {
  designGenerateTool, designEditTool, designVariantsTool,
} from "./design";

import {
  dataCalculateTool, dataCleanTool, dataPivotTool,
  codeExecuteTool, pythonDataProcessTool,
} from "./data";

import {
  webSearchTool, webSearchAdvancedTool, webReaderTool,
  researchDeepTool, researchSynthesizeTool, researchSaveBriefTool,
  researchSaveDataTool, weatherGetTool,
} from "./research";

import {
  opsHealthCheckTool, opsDeploymentStatusTool, opsGithubActivityTool,
  opsAgentStatsTool,
} from "./ops";

import {
  createPdfReportTool, createDocxDocumentTool, createXlsxSpreadsheetTool,
  createPptxPresentationTool, generateChartTool,
} from "./documents";

import {
  llmChatTool,
} from "./llm";

import {
  financeQueryTool,
} from "./finance";

import {
  academicSearchTool,
} from "./academic";

import {
  contentAnalyzeTool,
} from "./content";

import {
  delegateToAgentTool, queryAgentTool, scheduleAgentTaskTool,
  getTeamStatusTool, shareProgressTool, getTeamProgressTool,
} from "./delegation";

import {
  projectCreateTool, projectAddTaskTool, projectStatusTool, projectListTool,
  projectUpdateTool, projectDeleteTool, projectRetryTaskTool,
  projectSkipTaskTool, projectDecomposeAndAddTool, projectHealthTool,
} from "./projects";

import {
  a2aSendMessageTool, a2aBroadcastTool, a2aCheckInboxTool,
  a2aShareContextTool, a2aQueryContextTool, a2aCollaborateTool,
} from "./a2a-tools";

import {
  skillListTool, skillUseTool, skillCreateTool, skillEquipTool,
  skillRateTool, skillInspectTool, skillEvaluateTool, skillEvolveTool,
  skillRollbackTool, skillSearchHybridTool, skillRefreshEmbeddingsTool,
  skillEmbeddingSetupTool,
} from "./skills";

import {
  workflowPlanTool, workflowExecuteTool, workflowStatusTool, workflowListTool,
  workflowStepExecuteTool, workflowCancelTool, workflowScheduleTool,
  workflowUpdateScheduleTool,
} from "./workflows";

import {
  taskboardCreateTool, taskboardUpdateTool, taskboardListTool,
  taskboardDeleteTool, taskboardSummaryTool,
} from "./taskboard";

import {
  routineCreateTool, routineListTool, routineUpdateTool, routineDeleteTool,
  routineToggleTool, cronSyncTool,
} from "./routines";

import {
  reminderCreateTool, reminderListTool, reminderUpdateTool,
  reminderDeleteTool, reminderCompleteTool,
} from "./reminders";

import {
  todoCreateTool, todoListTool, todoUpdateTool, todoDeleteTool, todoStatsTool,
} from "./todos";

import {
  contactCreateTool, contactListTool, contactSearchTool,
  contactUpdateTool, contactDeleteTool,
} from "./contacts";

// ---------------------------------------------------------------------------
// All Tools Registry — single source of truth
// ---------------------------------------------------------------------------
export const allTools: Record<string, ToolType> = {
  // Gmail
  gmail_send: gmailSendTool,
  gmail_fetch: gmailFetchTool,
  gmail_labels: gmailLabelsTool,
  gmail_create_label: gmailCreateLabelTool,
  gmail_delete_label: gmailDeleteLabelTool,
  gmail_profile: gmailProfileTool,
  gmail_reply: gmailReplyTool,
  gmail_thread: gmailThreadTool,
  gmail_batch: gmailBatchTool,
  gmail_send_attachment: gmailSendWithAttachmentTool,
  // Calendar
  calendar_list: calendarListTool,
  calendar_events: calendarEventsTool,
  calendar_create: calendarCreateTool,
  calendar_update: calendarUpdateTool,
  calendar_delete: calendarDeleteTool,
  calendar_freebusy: calendarFreebusyTool,
  // Drive
  drive_list: driveListTool,
  drive_create_folder: driveCreateFolderTool,
  drive_create_file: driveCreateFileTool,
  download_drive_file: downloadDriveFileTool,
  // Sheets
  sheets_read: sheetsReadTool,
  sheets_values: sheetsValuesTool,
  sheets_append: sheetsAppendTool,
  sheets_update: sheetsUpdateTool,
  sheets_create: sheetsCreateTool,
  sheets_add_sheet: sheetsAddSheetTool,
  sheets_batch_get: sheetsBatchGetTool,
  sheets_clear: sheetsClearTool,
  // Docs
  docs_list: docsListTool,
  docs_read: docsReadTool,
  docs_create: docsCreateTool,
  docs_append: docsAppendTool,
  // GitHub
  github_repo: githubRepoTool,
  github_issues: githubIssuesTool,
  github_create_issue: githubCreateIssueTool,
  github_prs: githubPrsTool,
  github_commits: githubCommitsTool,
  github_files: githubFilesTool,
  github_read_file: githubReadFileTool,
  github_search: githubSearchTool,
  github_branches: githubBranchesTool,
  github_update_issue: githubUpdateIssueTool,
  github_create_pr: githubCreatePrTool,
  github_pr_review: githubPrReviewTool,
  github_pr_comment: githubPrCommentTool,
  github_create_branch: githubCreateBranchTool,
  // Vercel
  vercel_projects: vercelProjectsTool,
  vercel_deployments: vercelDeploymentsTool,
  vercel_domains: vercelDomainsTool,
  vercel_deploy: vercelDeployTool,
  vercel_logs: vercelLogsTool,
  // Web Tools
  web_search: webSearchTool,
  web_search_advanced: webSearchAdvancedTool,
  web_reader: webReaderTool,
  // Agent Delegation
  delegate_to_agent: delegateToAgentTool,
  // A2A
  query_agent: queryAgentTool,
  // Vision Tools
  vision_analyze: visionAnalyzeTool,
  vision_download_analyze: visionDownloadAnalyzeTool,
  // Design Tools
  design_generate: designGenerateTool,
  design_edit: designEditTool,
  design_variants: designVariantsTool,
  // Data Analysis Tools
  data_calculate: dataCalculateTool,
  data_clean: dataCleanTool,
  data_pivot: dataPivotTool,
  // Research Tools
  research_deep: researchDeepTool,
  research_synthesize: researchSynthesizeTool,
  research_save_brief: researchSaveBriefTool,
  research_save_data: researchSaveDataTool,
  // Ops Tools
  ops_health_check: opsHealthCheckTool,
  ops_deployment_status: opsDeploymentStatusTool,
  ops_github_activity: opsGithubActivityTool,
  ops_agent_stats: opsAgentStatsTool,
  // File Creation Tools
  create_pdf_report: createPdfReportTool,
  create_docx_document: createDocxDocumentTool,
  create_xlsx_spreadsheet: createXlsxSpreadsheetTool,
  create_pptx_presentation: createPptxPresentationTool,
  generate_chart: generateChartTool,
  llm_chat: llmChatTool,
  finance_query: financeQueryTool,
  academic_search: academicSearchTool,
  content_analyze: contentAnalyzeTool,
  // Workspace Tools
  reminder_create: reminderCreateTool,
  reminder_list: reminderListTool,
  reminder_update: reminderUpdateTool,
  reminder_delete: reminderDeleteTool,
  reminder_complete: reminderCompleteTool,
  todo_create: todoCreateTool,
  todo_list: todoListTool,
  todo_update: todoUpdateTool,
  todo_delete: todoDeleteTool,
  todo_stats: todoStatsTool,
  contact_create: contactCreateTool,
  contact_list: contactListTool,
  contact_search: contactSearchTool,
  contact_update: contactUpdateTool,
  contact_delete: contactDeleteTool,
  // Project Management
  project_create: projectCreateTool,
  project_add_task: projectAddTaskTool,
  project_status: projectStatusTool,
  project_list: projectListTool,
  project_update: projectUpdateTool,
  project_delete: projectDeleteTool,
  project_retry_task: projectRetryTaskTool,
  project_skip_task: projectSkipTaskTool,
  project_decompose_and_add: projectDecomposeAndAddTool,
  project_health: projectHealthTool,
  // A2A Communication
  a2a_send_message: a2aSendMessageTool,
  a2a_broadcast: a2aBroadcastTool,
  a2a_check_inbox: a2aCheckInboxTool,
  a2a_share_context: a2aShareContextTool,
  a2a_query_context: a2aQueryContextTool,
  a2a_collaborate: a2aCollaborateTool,
  // Code & Weather
  code_execute: codeExecuteTool,
  weather_get: weatherGetTool,
  // Skill Library
  skill_list: skillListTool,
  skill_use: skillUseTool,
  skill_create: skillCreateTool,
  skill_equip: skillEquipTool,
  skill_rate: skillRateTool,
  skill_inspect: skillInspectTool,
  skill_evaluate: skillEvaluateTool,
  skill_evolve: skillEvolveTool,
  skill_rollback: skillRollbackTool,
  skill_search_hybrid: skillSearchHybridTool,
  skill_refresh_embeddings: skillRefreshEmbeddingsTool,
  skill_embedding_setup: skillEmbeddingSetupTool,
  // Workflows
  workflow_plan: workflowPlanTool,
  workflow_execute: workflowExecuteTool,
  workflow_status: workflowStatusTool,
  workflow_list: workflowListTool,
  workflow_step_execute: workflowStepExecuteTool,
  workflow_cancel: workflowCancelTool,
  workflow_schedule: workflowScheduleTool,
  workflow_update_schedule: workflowUpdateScheduleTool,
  // Task Board
  taskboard_create: taskboardCreateTool,
  taskboard_update: taskboardUpdateTool,
  taskboard_list: taskboardListTool,
  taskboard_delete: taskboardDeleteTool,
  taskboard_summary: taskboardSummaryTool,
  // Routines
  routine_create: routineCreateTool,
  routine_list: routineListTool,
  routine_update: routineUpdateTool,
  routine_delete: routineDeleteTool,
  routine_toggle: routineToggleTool,
  cron_sync: cronSyncTool,
  // Team Coordination
  schedule_agent_task: scheduleAgentTaskTool,
  get_team_status: getTeamStatusTool,
  share_progress: shareProgressTool,
  get_team_progress: getTeamProgressTool,
};

// ---------------------------------------------------------------------------
// Helper: get subset of tools for an agent
// ---------------------------------------------------------------------------
export function getToolsForAgent(agentId: string): Record<string, ToolType> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAgent } = require("../agents");
  const agent = getAgent(agentId as string);
  if (!agent) return {};
  const subset: Record<string, ToolType> = {};
  for (const toolId of agent.tools) {
    if (allTools[toolId]) {
      subset[toolId] = allTools[toolId];
    }
  }
  return subset;
}
