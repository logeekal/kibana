/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END } from '@langchain/langgraph';
import type { nlToEsqlState } from './state';

const extractEsqlFromMessage = (content: string): string | undefined => {
  // Extract ESQL from code blocks
  const match = content.match(/```esql\n([\s\S]*?)\n```/);
  return match?.[1]?.trim();
};

export const esqlAgentRouter = (state: typeof nlToEsqlState.State): string => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];

  // Check for tool calls - LLM wants to use tools
  if ('tool_calls' in lastMessage && lastMessage.tool_calls?.length > 0) {
    return 'tools';
  }

  // Check if LLM has output a final ESQL query
  const content =
    typeof lastMessage.content === 'string'
      ? lastMessage.content
      : lastMessage.content.map((c) => (c.type === 'text' ? c.text : '')).join('');

  const finalEsqlQuery = extractEsqlFromMessage(content);

  // If we have a final query, assume LLM has validated it and end
  if (finalEsqlQuery) {
    return END;
  }

  // Continue reasoning (back to agent)
  // Agent will either:
  // - Call tools to get mappings
  // - Generate query (handled in agent node)
  // - Call validate_esql tool
  // - Fix errors and validate again
  return 'agent';
};
