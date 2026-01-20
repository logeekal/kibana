/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GraphNode } from '../../types';
import type { TranslateRuleGraphParams } from '../../types';
import { getNlToEsqlSubGraph } from '../../sub_graphs/nl_to_esql/graph';
import {
  getElasticRiskScoreFromOriginalRule,
  getElasticSeverityFromOriginalRule,
} from '../translate_rule/severity';
import { generateAssistantComment } from '../../../../../../../common/task/util/comments';

export const getNlToEsqlWrapperNode = (params: TranslateRuleGraphParams): GraphNode => {
  const nlToEsqlSubGraph = getNlToEsqlSubGraph({
    platformTools: params.platformTools ?? [], // Default to empty array if undefined
    esqlKnowledgeBase: params.esqlKnowledgeBase,
    logger: params.logger,
  });

  return async (state, config) => {
    // Extract index patterns from integration
    const indexPatterns = state.integration?.data_streams
      ?.map((dataStream) => dataStream.index_pattern)
      .join(',');

    // Prepare input state for nlToEsql subgraph
    const nlToEsqlInput = {
      nl_query: state.nl_query,
      index_pattern: indexPatterns,
      messages: [],
    };

    // Invoke the nlToEsql subgraph
    const nlToEsqlResult = await nlToEsqlSubGraph.invoke(nlToEsqlInput, config);

    // Extract ESQL query and comments from subgraph result
    const esqlQuery = nlToEsqlResult.esql_query;
    const translationComments = nlToEsqlResult.translation_comments || [];

    if (!esqlQuery) {
      // If no query generated, return comments only
      return {
        comments: translationComments.map((comment) => generateAssistantComment(comment)),
      };
    }

    // Map subgraph output back to translateRuleState
    return {
      elastic_rule: {
        query: esqlQuery,
        query_language: 'esql',
        risk_score: await getElasticRiskScoreFromOriginalRule(state.original_rule),
        severity: await getElasticSeverityFromOriginalRule(state.original_rule),
        ...(state.integration?.id && { integration_ids: [state.integration.id] }),
      },
      comments: translationComments.map((comment) => generateAssistantComment(comment)),
      // Mark that ECS mapping is included (handled in nlToEsql subgraph)
      includes_ecs_mapping: true,
    };
  };
};
