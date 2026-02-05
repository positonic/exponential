import { type ParsedActionItem } from './processors/ActionProcessor';

export interface FirefliesSummary {
  keywords?: string[];
  action_items?: string[] | string; // Can be either array or formatted string
  outline?: string;
  shorthand_bullet?: string[];
  overview?: string;
  bullet_gist?: string[];
  gist?: string;
  short_summary?: string;
  short_overview?: string;
  meeting_type?: string;
  topics_discussed?: string[];
  transcript_chapters?: Array<{
    title: string;
    start_time: number;
    end_time: number;
  }>;
}

export interface FirefliesTranscript {
  id: string;
  title: string;
  date?: number; // Meeting timestamp in milliseconds
  sentences: Array<{
    text: string;
    speaker_name: string | null;
    start_time: number;
    end_time: number;
  }>;
  summary: FirefliesSummary | null;
}

export interface ProcessedTranscriptionData {
  summary: FirefliesSummary;
  actionItems: ParsedActionItem[];
  transcriptText: string;
}

export class FirefliesService {
  /**
   * Parse action items from Fireflies summary
   */
  static parseActionItems(summary: FirefliesSummary): ParsedActionItem[] {
    const actionItems: ParsedActionItem[] = [];

    if (!summary.action_items) {
      return actionItems;
    }

    // Handle both string format and array format
    let actionTexts: string[] = [];
    
    if (Array.isArray(summary.action_items)) {
      // If it's already an array, use it directly
      actionTexts = summary.action_items;
    } else if (typeof summary.action_items === 'string') {
      // If it's a string, parse it to extract individual action items
      actionTexts = this.parseActionItemsFromString(summary.action_items);
    }

    for (const actionText of actionTexts) {
      const parsedItem = this.parseActionItemText(actionText, { strict: false });
      if (parsedItem) {
        actionItems.push(parsedItem);
      }
    }

    return actionItems;
  }

  /**
   * Extract action items from raw transcript text as a fallback.
   */
  static extractActionItemsFromTranscriptText(transcriptText: string): ParsedActionItem[] {
    if (!transcriptText || transcriptText.trim().length === 0) {
      return [];
    }

    const matched = new Set<string>();
    const actionItems: ParsedActionItem[] = [];
    let currentSpeaker: string | undefined;

    const lines = transcriptText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      // Skip timestamp / chapter headings
      if (/^\d{1,2}:\d{2}\s*(?:[-–]\s*\d{1,2}:\d{2})?/.test(line)) {
        continue;
      }

      let content = line;
      const speakerMatch = line.match(
        /^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)*):\s*(.+)$/
      );
      if (speakerMatch) {
        currentSpeaker = speakerMatch[1]?.trim();
        content = speakerMatch[2]?.trim() ?? "";
      }

      if (!content || content.length < 10) {
        continue;
      }

      const sentences = content
        .split(/[.!?]+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 10);

      for (const sentence of sentences) {
        const normalized = sentence.replace(/\s+/g, " ").trim();
        if (!normalized) continue;
        if (matched.has(normalized)) continue;
        matched.add(normalized);

        const parsedItem = this.parseActionItemText(normalized, {
          strict: true,
          speakerName: currentSpeaker,
        });
        if (parsedItem) {
          actionItems.push(parsedItem);
        }

        if (actionItems.length >= 25) {
          break;
        }
      }

      if (actionItems.length >= 25) {
        break;
      }
    }

    return actionItems;
  }

  /**
   * Parse action items from a formatted string with assignee information
   */
  private static parseActionItemsFromString(actionItemsString: string): string[] {
    const actionItems: string[] = [];
    
    // Split by lines and filter out empty lines
    const lines = actionItemsString.split('\n').map(line => line.trim()).filter(line => line);
    
    let currentAssignee = '';
    
    for (const line of lines) {
      // Check if this is a section header (assignee name like **Lukas Sommer**)
      if (line.startsWith('**') && line.endsWith('**')) {
        // Extract the assignee name (remove ** markers)
        currentAssignee = line.slice(2, -2).trim();
        continue;
      }
      
      // Skip empty lines
      if (!line) {
        continue;
      }
      
      // This is an action item - append assignee information
      if (currentAssignee) {
        actionItems.push(`${line} [ASSIGNEE:${currentAssignee}]`);
      } else {
        actionItems.push(line);
      }
    }
    
    return actionItems;
  }

  /**
   * Parse individual action item text to extract details
   */
  private static parseActionItemText(
    text: string,
    options?: { strict?: boolean; speakerName?: string }
  ): ParsedActionItem | null {
    if (!text || text.trim().length === 0) {
      return null;
    }

    let cleanText = text.trim();

    if (options?.strict) {
      // Drop obvious non-action lines (chapter headings, timestamps, questions)
      const nonActionPatterns = [
        /^\d{1,2}:\d{2}\s*(?:[-–]\s*\d{1,2}:\d{2})?/,
        /\bwrap-up\b/i,
        /\bnext steps\b/i,
        /^\s*(?:here’s|here is)\s+what\b/i,
        /^\s*(?:and\s+today,?\s*)?what\s+does\b/i,
        /^\s*how\s+does\b/i,
        /^\s*why\s+does\b/i,
        /^\s*when\s+does\b/i,
        /^\s*where\s+does\b/i,
        /^\s*who\s+does\b/i,
      ];
      const looksLikeQuestion = cleanText.endsWith("?");
      const looksLikeNonAction = nonActionPatterns.some((pattern) => pattern.test(cleanText));

      if (looksLikeQuestion || looksLikeNonAction) {
        return null;
      }

      // Require action-like intent (imperative or commitment phrasing)
      const actionIntentPatterns = [
        /^(?:action\s*item|todo|task|next\s*step|follow\s*up)\b/i,
        /^(?:please|assign|send|share|schedule|book|set up|create|draft|write|update|fix|review|ship|publish|deploy|test|investigate|follow up|circle back|confirm|ping|email|call|message|sync|meet|prepare|finalize|collect|gather|compile|organize|summarize)\b/i,
        /\b(?:we should|we need to|we'll|we will|let's|lets|need to|needs to|must|assign|owner|due by|by end of|by eod|by eow)\b/i,
      ];
      const hasActionIntent = actionIntentPatterns.some((pattern) => pattern.test(cleanText));
      if (!hasActionIntent) {
        return null;
      }
    }
    let assignee: string | undefined;

    // Extract assignee from [ASSIGNEE:Name] tag first
    const assigneeTagMatch = cleanText.match(/\[ASSIGNEE:([^\]]+)\]$/);
    if (assigneeTagMatch) {
      assignee = assigneeTagMatch[1]!.trim();
      // Remove the assignee tag from the text
      cleanText = cleanText.replace(/\s*\[ASSIGNEE:[^\]]+\]$/, '').trim();
    }

    const actionItem: ParsedActionItem = {
      text: cleanText,
      assignee: assignee,
    };

    // Also try to extract assignee from @mention or "John will..." patterns (fallback)
    if (!assignee) {
      const assigneeMatch = cleanText.match(/@(\w+)/i);
      if (assigneeMatch?.[1]) {
        actionItem.assignee = assigneeMatch[1];
      } else {
        const namedAssigneeMatch = cleanText.match(
          /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:will|should|needs to|must|to)\b/
        );
        if (namedAssigneeMatch?.[1]) {
          actionItem.assignee = namedAssigneeMatch[1];
        }
      }
    }

    if (!actionItem.assignee && options?.speakerName) {
      const firstPersonPatterns = [
        /\bI will\b/i,
        /\bI'll\b/i,
        /\bI can\b/i,
        /\bI should\b/i,
        /\bI need to\b/i,
        /\bI'm going to\b/i,
        /\blet me\b/i,
      ];
      const hasFirstPerson = firstPersonPatterns.some((pattern) => pattern.test(cleanText));
      if (hasFirstPerson) {
        actionItem.assignee = options.speakerName;
      }
    }

    // Extract due date (look for date patterns)
    const dueDateMatch = text.match(/(?:by|before|until|due)\s+([\w\s,]+?)(?:\s|$|\.)/i);
    if (dueDateMatch && dueDateMatch[1]) {
      const dateStr = dueDateMatch[1].trim();
      const parsedDate = this.parseDate(dateStr);
      if (parsedDate) {
        actionItem.dueDate = parsedDate;
      }
    }

    // Extract priority indicators
    const priorityMatch = text.match(/(?:urgent|asap|high priority|important|low priority|whenever)/i);
    if (priorityMatch) {
      actionItem.priority = priorityMatch[0].toLowerCase();
    }

    // Store original context
    actionItem.context = `From Fireflies transcript: "${text}"`;

    return actionItem;
  }

  /**
   * Parse date strings into Date objects
   */
  private static parseDate(dateStr: string): Date | undefined {
    try {
      // Handle common relative dates
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      const lowerStr = dateStr.toLowerCase().trim();

      if (lowerStr.includes('today')) {
        return today;
      }
      if (lowerStr.includes('tomorrow')) {
        return tomorrow;
      }
      if (lowerStr.includes('next week')) {
        return nextWeek;
      }
      if (lowerStr.includes('end of week') || lowerStr.includes('friday')) {
        const friday = new Date(today);
        const daysUntilFriday = (5 - today.getDay() + 7) % 7;
        friday.setDate(today.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
        return friday;
      }

      // Try to parse as a regular date
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime()) && parsed > today) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to parse date:', dateStr, error);
    }

    return undefined;
  }

  /**
   * Structure summary data for storage and display
   */
  static processSummary(summary: FirefliesSummary | null | undefined): FirefliesSummary {
    if (!summary) {
      return {
        keywords: [],
        action_items: [],
        outline: '',
        shorthand_bullet: [],
        overview: '',
        bullet_gist: [],
        gist: '',
        short_summary: '',
        short_overview: '',
        meeting_type: '',
        topics_discussed: [],
        transcript_chapters: [],
      };
    }

    return {
      keywords: summary.keywords || [],
      action_items: summary.action_items || [],
      outline: summary.outline || '',
      shorthand_bullet: summary.shorthand_bullet || [],
      overview: summary.overview || '',
      bullet_gist: summary.bullet_gist || [],
      gist: summary.gist || '',
      short_summary: summary.short_summary || '',
      short_overview: summary.short_overview || '',
      meeting_type: summary.meeting_type || '',
      topics_discussed: summary.topics_discussed || [],
      transcript_chapters: summary.transcript_chapters || [],
    };
  }

  /**
   * Convert transcript sentences to readable text
   */
  static formatTranscriptText(sentences: FirefliesTranscript['sentences']): string {
    if (!sentences || sentences.length === 0) {
      return '';
    }

    return sentences
      .map(sentence => {
        const speaker = sentence.speaker_name ? `${sentence.speaker_name}: ` : '';
        return `${speaker}${sentence.text}`;
      })
      .join('\n');
  }

  /**
   * Main processing function for Fireflies transcript data
   */
  static processTranscription(transcript: FirefliesTranscript): ProcessedTranscriptionData {
    try {
      const summary = this.processSummary(transcript.summary);
      console.log('📚 summary', summary);
      const actionItems = this.parseActionItems(summary);
      const transcriptText = JSON.stringify(transcript, null, 2);

      return {
        summary,
        actionItems,
        transcriptText,
      };
    } catch (error) {
      console.error(`Failed to process transcript ${transcript.id}:`, error);
      
      // Return minimal data if processing fails
      return {
        summary: this.processSummary(null), // Returns empty summary
        actionItems: [],
        transcriptText: JSON.stringify(transcript, null, 2),
      };
    }
  }

  /**
   * Generate a readable summary for notifications (Slack, email, etc.)
   */
  static generateNotificationSummary(summary: FirefliesSummary, actionItemsCount: number): string {
    const sections: string[] = [];

    // Title and basic info
    if (summary.meeting_type) {
      sections.push(`📋 *${summary.meeting_type}*`);
    }

    // Overview
    if (summary.short_overview || summary.overview) {
      sections.push(`📝 *Overview:*\n${summary.short_overview || summary.overview}`);
    }

    // Key topics
    if (summary.topics_discussed && summary.topics_discussed.length > 0) {
      sections.push(`🗣️ *Topics Discussed:*\n• ${summary.topics_discussed.join('\n• ')}`);
    }

    // Key points
    if (summary.bullet_gist && summary.bullet_gist.length > 0) {
      sections.push(`🎯 *Key Points:*\n• ${summary.bullet_gist.join('\n• ')}`);
    }

    // Action items count
    if (actionItemsCount > 0) {
      sections.push(`✅ *Action Items:* ${actionItemsCount} items created`);
    }

    // Keywords
    if (summary.keywords && summary.keywords.length > 0) {
      sections.push(`🏷️ *Keywords:* ${summary.keywords.join(', ')}`);
    }

    return sections.join('\n\n');
  }
}