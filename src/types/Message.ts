export interface Message {
  type: 'system' | 'human' | 'ai' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
} 