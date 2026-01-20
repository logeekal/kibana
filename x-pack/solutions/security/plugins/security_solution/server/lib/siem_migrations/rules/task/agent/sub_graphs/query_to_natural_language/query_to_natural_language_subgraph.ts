/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { ChatModel } from '../../../../../common/task/util/actions_client_chat';
import { cleanMarkdown, generateAssistantComment } from '../../../../../common/task/util/comments';
import type { RulesMigrationTools } from '../../tools';
import { queryToNLState } from './state';
import type { QueryToNLState } from './state';
import { getVendorPrompt, formatResourcesContext } from './prompts';
import { migrateRuleConfigSchema } from '../../state';

export interface QueryToNLSubGraphParams {
  model: ChatModel;
  tools: RulesMigrationTools;
}

/**
 * Creates a mini-subgraph that converts queries to natural language descriptions.
 * This is a standalone, reusable function that can be used as a tool by other agents.
 *
 * Architecture:
 * - Single LLM node that interprets queries using vendor-specific prompts
 * - Tool node for fetching resources (rules, lookups, macros) when needed
 * - ReAct loop: LLM → Tools → LLM until interpretation is complete
 *
 * @returns A compiled LangGraph subgraph
 */
export function getQueryToNaturalLanguageSubGraph({ model, tools }: QueryToNLSubGraphParams) {
  const modelWithTools = model.bindTools([tools.getRulesByName, tools.getResourceByType]);
  const vendorResourcesToolNode = new ToolNode([tools.getRulesByName, tools.getResourceByType]);

  /**
   * Main LLM node - interprets query and produces natural language description
   */
  const queryToNLNode = async (state: QueryToNLState) => {
    const { original_rule, resources } = state;

    // Get vendor-specific prompt
    const promptTemplate = getVendorPrompt(original_rule.vendor);

    // Format resources context
    const resourcesContext = formatResourcesContext(resources);

    // Format prompt variables (same interface for all vendors)
    const promptVars = {
      title: original_rule.title,
      description: original_rule.description ?? '',
      query: original_rule.query, // Original query - no transformation
      resources: resourcesContext,
    };

    // Format prompt messages
    const promptMessages = await promptTemplate.formatMessages(promptVars);

    // Invoke LLM with tools
    const response = await modelWithTools.invoke([
      ...promptMessages,
      ...(state.messages ?? []), // Conversation history
    ]);

    // If tool calls exist, return for execution (will loop back)
    if (response.tool_calls?.length) {
      return {
        messages: [response],
      };
    }

    // Extract nl_query from final response
    const nlQuery = response.text || '';
    const comments = [generateAssistantComment(cleanMarkdown(nlQuery))];

    // Return nl_query, comments, and messages
    // Messages are needed for the router to check completion, and are persisted via messagesStateReducer
    return {
      messages: [response],
      nl_query: nlQuery,
      comments,
    };
  };

  /**
   * Router - checks if tool calls exist
   */
  const router = (state: QueryToNLState): string => {
    const lastMessage = state.messages.at(-1);
    return lastMessage?.tool_calls?.length ? 'shouldFetchResources' : 'hasAllResources';
  };

  // Build the subgraph
  const queryToNLGraph = new StateGraph(queryToNLState, migrateRuleConfigSchema)
    .addNode('queryToNL', queryToNLNode)
    .addNode('vendorResourcesToolNode', vendorResourcesToolNode)
    // Edges
    .addEdge(START, 'queryToNL')
    .addConditionalEdges('queryToNL', router, {
      shouldFetchResources: 'vendorResourcesToolNode',
      hasAllResources: END,
    })
    .addEdge('vendorResourcesToolNode', 'queryToNL'); // Loop back to LLM after tool execution

  const graph = queryToNLGraph.compile();
  graph.name = 'Query To Natural Language SubGraph';
  return graph;
}
