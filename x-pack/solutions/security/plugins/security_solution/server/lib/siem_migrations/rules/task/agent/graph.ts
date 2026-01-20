/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { getMatchPrebuiltRuleNode } from './nodes/match_prebuilt_rule';
import { migrateRuleConfigSchema, migrateRuleState } from './state';
import { getTranslateRuleGraph } from './sub_graphs/translate_rule';
import type { MigrateRuleConfig, MigrateRuleGraphParams, MigrateRuleState } from './types';
import { getQueryToNaturalLanguageSubGraph } from './sub_graphs/query_to_natural_language';
import { getGenerateSemanticQueryNode } from './nodes/generate_semantic_query';

/**
 * Simplified Rule Migration Graph
 *
 * Architecture:
 * 1. QueryToNaturalLanguage (mini-subgraph) - Interprets query → nl_query
 * 2. GenerateSemanticQuery - Generates semantic keywords from nl_query → semantic_query
 * 3. PrebuiltRuleMatch - Matches against Elastic prebuilt rules
 * 4. TranslateRule (subgraph) - Translates to ES|QL
 */
export function getRuleMigrationAgent({
  model,
  esqlKnowledgeBase,
  ruleMigrationsRetriever,
  logger,
  telemetryClient,
  tools,
  platformTools = [],
}: MigrateRuleGraphParams) {
  const matchPrebuiltRuleNode = getMatchPrebuiltRuleNode({
    model,
    logger,
    ruleMigrationsRetriever,
    telemetryClient,
  });

  // Create the queryToNaturalLanguage subgraph (standalone, reusable)
  const queryToNLSubGraph = getQueryToNaturalLanguageSubGraph({
    model,
    tools,
  });

  // Generate semantic query - vendor-agnostic, uses title, description, and nl_query
  const generateSemanticQueryNode = getGenerateSemanticQueryNode({ model });

  const translationSubGraph = getTranslateRuleGraph({
    model,
    esqlKnowledgeBase,
    ruleMigrationsRetriever,
    telemetryClient,
    logger,
  });

  const siemMigrationAgentGraph = new StateGraph(migrateRuleState, migrateRuleConfigSchema)
    // Nodes
    .addNode('queryToNaturalLanguage', queryToNLSubGraph) // Subgraph as node
    .addNode('generateSemanticQuery', generateSemanticQueryNode)
    .addNode('matchPrebuiltRule', matchPrebuiltRuleNode)
    .addNode('translationSubGraph', translationSubGraph)
    // Edges
    .addEdge(START, 'queryToNaturalLanguage')
    .addEdge('queryToNaturalLanguage', 'generateSemanticQuery')
    .addConditionalEdges('generateSemanticQuery', skipPrebuiltRuleRouter, {
      skipPrebuiltRule: 'translationSubGraph',
      matchPrebuiltRule: 'matchPrebuiltRule',
    })
    .addConditionalEdges('matchPrebuiltRule', matchedPrebuiltRuleConditional, [
      'translationSubGraph',
      END,
    ])
    .addEdge('translationSubGraph', END);

  const graph = siemMigrationAgentGraph.compile();
  graph.name = 'Rule Migration Graph'; // Customizes the name displayed in LangSmith
  return graph;
}

/**
 * Router after generateSemanticQuery completes:
 * - If skipPrebuiltRulesMatching is enabled, skip to translation
 * - Otherwise, proceed to matchPrebuiltRule
 */
function skipPrebuiltRuleRouter(state: MigrateRuleState, config: MigrateRuleConfig): string {
  if (config.configurable?.skipPrebuiltRulesMatching) {
    return 'skipPrebuiltRule';
  }
  return 'matchPrebuiltRule';
}

/**
 * Router after matchPrebuiltRule:
 * - If prebuilt rule matched, end
 * - Otherwise, proceed to translation
 */
const matchedPrebuiltRuleConditional = (state: MigrateRuleState) => {
  if (state.elastic_rule?.prebuilt_rule_id) {
    return END;
  }
  return 'translationSubGraph';
};
