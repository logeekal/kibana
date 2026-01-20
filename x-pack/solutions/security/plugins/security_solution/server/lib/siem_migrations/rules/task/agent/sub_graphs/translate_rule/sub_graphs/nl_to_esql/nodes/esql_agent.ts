/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Command } from '@langchain/langgraph';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Logger } from '@kbn/core/server';
import { toolDefinitionToInference } from '@kbn/inference-langchain/src/chat_model/to_inference/tools';
import { messagesToInference } from '@kbn/inference-langchain/src/chat_model/to_inference/messages';
import { responseToLangchainMessage } from '@kbn/inference-langchain/src/chat_model/from_inference';
import type { EsqlKnowledgeBase } from '../../../../../../../../common/task/util/esql_knowledge_base';
import type { nlToEsqlState } from '../state';

export const getEsqlAgentNode = ({
  tools,
  esqlKnowledgeBase,
  logger,
}: {
  tools: StructuredToolInterface[];
  esqlKnowledgeBase: EsqlKnowledgeBase;
  logger: Logger;
}) => {
  return async (state: typeof nlToEsqlState.State) => {
    const { messages: stateMessages, nl_query, index_pattern } = state;

    // Convert Langchain messages to inference format
    const inferenceMessages = messagesToInference(stateMessages);

    // Determine main index pattern
    const mainIndexPattern = index_pattern || 'logs-*';

    // Build system prompt with workflow instructions
    const systemPrompt = `

You are an expert at translating security detection rules to ES|QL queries.

Follow this workflow to generate a valid and accurate ES|QL query based on the provided natural language description :

1. Check if main/source index pattern is provided:
   - If yes: Use get_index_mapping tool to get its mapping. If mapping not found, use ECS mapping.
   - If no: Assume logs-* and get its mapping.

2. Check if lookup index patterns are needed:
   - If yes: Use get_index_mapping tool to get their mappings. This will help with correct syntax for lookup joins.

3. After gathering all mappings, generate the ESQL query.

4. Use validate_esql tool to validate the query.

5. If validation has errors:
   - Fix the errors in the query
   - Use validate_esql tool again
   - Repeat until query is valid

6. If validation has not errors and is valid (signified by \`valid: true\`), output the final ESQL query in a code block: \`\`\`esql\n...\n\`\`\`

Available tools:
- get_index_mapping: Get field mappings for specific indices (use this for main index and lookup indices)
- validate_esql: Validate ES|QL query syntax (MUST use this after query is generated)

Main index pattern: ${mainIndexPattern}

IMPORTANT:
- Always validate queries using validate_esql tool
- Fix errors and re-validate until query is valid
- Only output final query when validation passes`;

    // Convert Langchain tools to inference format
    const inferenceTools = toolDefinitionToInference(tools);

    logger.info(`Inference Tools: ${Object.keys(inferenceTools).join(', ')}`);

    // naturalLanguageToEsql accepts EITHER input OR messages, not both
    // If we have conversation history (tool results), use messages
    // Otherwise, use input string
    const hasConversationHistory = inferenceMessages.messages.length > 0;

    logger.info('Using EsqlKnowledgeBase.translate() with tools', {
      mainIndexPattern,
      toolsCount: Object.keys(inferenceTools).length,
      messagesCount: inferenceMessages.messages.length,
      usingMessages: hasConversationHistory,
    });

    // Use EsqlKnowledgeBase.translate() - it will handle the ReAct pattern with tools
    // naturalLanguageToEsql accepts EITHER input OR messages (discriminated union)
    // Response is ChatCompletionMessageEvent (includes content and toolCalls)
    const response = hasConversationHistory
      ? // Use messages if we have conversation history (includes tool results)
      // Pass empty string for input - translate() will use messages instead
      await esqlKnowledgeBase.translate('', {
        system: systemPrompt,
        messages: inferenceMessages.messages, // Full conversation with tool results
        tools: inferenceTools,
        functionCalling: 'auto',
      })
      : // Use input string for first call (no conversation history yet)
      // Don't pass messages - translate() will use input instead
      await esqlKnowledgeBase.translate(`Generate an ES|QL query for: ${nl_query}`, {
        system: systemPrompt,
        // No messages parameter - will use input string
        tools: inferenceTools,
        functionCalling: 'auto',
      });

    // Convert ChatCompletionMessageEvent to Langchain AIMessage format
    // This preserves tool calls if LLM used tools
    const aiMessage = responseToLangchainMessage(response);

    // Extract ESQL query from response content (EXACTLY same pattern as translate_rule node)
    const responseContent = response.content || '';
    const esqlQuery = responseContent.match(/```esql\n([\s\S]*?)\n```/)?.[1]?.trim() ?? '';

    if (esqlQuery) {
      // Extract translation summary (same as translate_rule node)
      const translationSummary = responseContent.match(/## Translation Summary[\s\S]*$/)?.[0] ?? '';

      logger.debug('Generated ESQL query using EsqlKnowledgeBase', {
        queryLength: esqlQuery.length,
        hasSummary: !!translationSummary,
        hasToolCalls: response.toolCalls?.length > 0,
      });

      return new Command({
        update: {
          messages: [aiMessage], // Includes tool calls if LLM used tools
          esql_query: esqlQuery, // Store in state
          translation_comments: translationSummary ? [translationSummary] : [],
        },
      });
    } else {
      logger.warn('Failed to extract ESQL query from EsqlKnowledgeBase response', {
        hasToolCalls: response.toolCalls?.length > 0,
      });
      // Still return the message (might have tool calls for validation)
      return new Command({
        update: {
          messages: [aiMessage],
        },
      });
    }
  };
};
