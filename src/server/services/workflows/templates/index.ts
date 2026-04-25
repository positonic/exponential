import { contentGenerationTemplate } from './contentGeneration';
import { pmStandupSummaryTemplate } from './pmStandupSummary';
import { pmSprintPlanningTemplate } from './pmSprintPlanning';
import { pmProjectHealthReportTemplate } from './pmProjectHealthReport';
import { pmMeetingPrepTemplate } from './pmMeetingPrep';

export {
  contentGenerationTemplate,
  pmStandupSummaryTemplate,
  pmSprintPlanningTemplate,
  pmProjectHealthReportTemplate,
  pmMeetingPrepTemplate,
};

// All templates for seeding
export const allTemplates = [
  // Content
  contentGenerationTemplate,
  // PM
  pmStandupSummaryTemplate,
  pmSprintPlanningTemplate,
  pmProjectHealthReportTemplate,
  pmMeetingPrepTemplate,
];
