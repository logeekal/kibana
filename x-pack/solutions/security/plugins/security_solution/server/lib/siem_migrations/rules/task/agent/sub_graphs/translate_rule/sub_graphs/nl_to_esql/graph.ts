/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { nlToEsqlState } from './state';
import { getEsqlAgentNode } from './nodes/esql_agent';
import { esqlAgentRouter } from './step_router';
import { createValidateEsqlTool } from './nodes/validate_esql_tool';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Logger } from '@kbn/core/server';
import type { EsqlKnowledgeBase } from '../../../../../../../common/task/util/esql_knowledge_base';
import { migrateRuleConfigSchema } from '../../../../state';

export const getNlToEsqlSubGraph = ({
  platformTools = [], // Platform tools from Agent Builder (default to empty array)
  esqlKnowledgeBase,
  logger,
}: {
  platformTools?: StructuredToolInterface[]; // indexExplorer, getIndexMapping
  esqlKnowledgeBase: EsqlKnowledgeBase;
  logger: Logger;
}) => {
  // Create validateEsql tool
  const validateEsqlTool = createValidateEsqlTool();

  // Combine all tools (ensure platformTools is an array)
  const allTools: StructuredToolInterface[] = [
    ...(Array.isArray(platformTools) ? platformTools : []),
    validateEsqlTool,
  ];

  const agentNode = getEsqlAgentNode({
    tools: allTools, // Pass all tools including validateEsql
    esqlKnowledgeBase,
    logger,
  });

  // Use Langchain's built-in ToolNode directly
  const toolsNode = new ToolNode(allTools);

  const graph = new StateGraph(nlToEsqlState, migrateRuleConfigSchema)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', esqlAgentRouter, {
      agent: 'agent',
      tools: 'tools',
      [END]: END,
    })
    .addEdge('tools', 'agent')
    .compile();

  graph.name = 'NL to ESQL Subgraph';
  return graph;
};
