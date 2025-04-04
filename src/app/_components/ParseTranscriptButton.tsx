'use client';

import { Button } from '@mantine/core';
import { IconGitPullRequest } from '@tabler/icons-react';
import { api } from "~/trpc/react";
import { type Message } from "~/types/Message";

interface ParseTranscriptButtonProps {
  transcription: string | null | undefined;
  githubSettings: {
    owner: string;
    repo: string;
    validAssignees: string[];
  };
  onParse: (message: Message) => void;
  messages: Message[];
}

export default function ParseTranscriptButton({ 
  transcription, 
  githubSettings, 
  onParse,
  messages 
}: ParseTranscriptButtonProps) {
  const chatMutation = api.tools.chat.useMutation();

  const handleParseTranscript = () => {
    const parsePrompt = `Please analyze this transcription and:

1. Extract all action items, tasks, and commitments
2. For each action item:
   - Create a GitHub issue with:
     - A clear title that starts with the action type (e.g., "Task:", "Feature:", "Bug:")
     - A detailed description including context from the transcript
     - Assign to the relevant team member (${githubSettings.validAssignees.join(", ")})
     - Add appropriate labels (e.g., "task", "feature", "bug")
3. Group related items into epics if there are multiple connected tasks
4. After creating each issue, provide me with:
   - A summary of what was created
   - The issue numbers and assignees
   - Any items that need clarification
   - When creating GitHub issues, always use repo: "${githubSettings.repo}" and owner: "${githubSettings.owner}"
   - Valid GitHub assignees are: ${githubSettings.validAssignees.join(", ")}
              
Please create these as individual issues rather than combining them, and include relevant context from the transcript in each issue description.

Current date: ${new Date().toISOString().split('T')[0]}
${transcription ? `\n\nTranscription content to analyze:\n${transcription}` : ''}`;

    const userMessage: Message = { type: 'human', content: parsePrompt };
    onParse(userMessage);
    
    chatMutation.mutate({
      message: parsePrompt,
      history: messages
    });
  };

  return (
    <Button
      leftSection={<IconGitPullRequest size={16} />}
      onClick={handleParseTranscript}
      variant="filled"
      color="blue"
      loading={chatMutation.isPending}
      disabled={!transcription}
    >
      Parse Transcript & Create Issues
    </Button>
  );
} 