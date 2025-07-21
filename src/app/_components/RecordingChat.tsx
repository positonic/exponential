'use client';

import { useState } from 'react';
// Setup model was removed
import Chat from "./Chat";
import { type Message } from "~/types/Message";
import ParseTranscriptButton from './ParseTranscriptButton';

interface RecordingChatProps {
  initialMessages?: Message[];
  transcription?: string | null;
  // setups?: Setup[]; // Setup model removed
  githubSettings?: {
    owner: string;
    repo: string;
    validAssignees: string[];
  };
}

export default function RecordingChat({ 
  initialMessages,
  transcription,
  // setups, // Setup model removed
  githubSettings = {
    owner: "akashic-fund",
    repo: "akashic",
    validAssignees: ["0xshikhar", "prajwalkundur", "positonic"]
  }
}: RecordingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  
  const recordingSystemMessage: Message = {
    type: 'system',
    content: `You are an AI assistant analyzing recordings and managing tasks in our Task Management System.
              Your primary responsibilities:
              1. Analyze transcriptions to identify action items, tasks, and key points
              2. Create tasks for any action items found using create_action
              3. Help manage and track tasks in the system
              
              When analyzing transcriptions:
              - Look for any mentioned tasks, todos, or action items
              - Create tasks for each action item found using create_action
              - Include relevant context from the transcription in task descriptions
              - If you find tasks that are already completed, create them with status: "COMPLETED"
              - For important tasks, create GitHub issues in the repository: ${githubSettings.owner}/${githubSettings.repo}
              
              Rules:
              - Never give IDs to the user since those are just for you to track
              - When creating tasks and you don't know the project, clarify with the user
              - Always create tasks using create_action with create: true
              - When creating GitHub issues, always use repo: "${githubSettings.repo}" and owner: "${githubSettings.owner}"
              - Valid GitHub assignees are: ${githubSettings.validAssignees.join(", ")}
              - Always break down tasks into smaller, actionable steps and favour making multiple issues over a single large issue
              - When considering if and how to group issues, consider the type of tasks to be assigned as issues for example backend programming vs frontend programming vs design or marketing.
              
              Current date: ${new Date().toISOString().split('T')[0]}
              ${transcription ? `\n\nTranscription content to analyze:\n${transcription}` : ''}`
  };

  const recordingInitialMessages: Message[] = [
    recordingSystemMessage,
    ...(initialMessages ?? [{
      type: 'ai',
      content: transcription 
        ? 'I can help analyze this recording and identify any action items. Would you like me to go through the transcription and list any tasks or action items I find?'
        : 'Hello! I\'m your AI assistant. How can I help you manage your tasks today?'
    }])
  ];

  const handleParseMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  return (
    <div className="flex flex-col h-full">
      <Chat 
        initialMessages={recordingInitialMessages}
        githubSettings={githubSettings}
        buttons={[
          <ParseTranscriptButton
            key="parse-button"
            transcription={transcription}
            githubSettings={githubSettings}
            onParse={handleParseMessage}
            messages={messages}
          />
        ]}
      />
    </div>
  );
} 