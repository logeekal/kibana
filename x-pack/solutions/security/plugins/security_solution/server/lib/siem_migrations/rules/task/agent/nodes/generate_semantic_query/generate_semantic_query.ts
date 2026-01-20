/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import type { GraphNode, MigrateRuleGraphParams } from '../../types';
import { GENERATE_SEMANTIC_QUERY_PROMPT } from './prompts';

interface GetGenerateSemanticQueryNodeParams {
  model: MigrateRuleGraphParams['model'];
}

interface GetSemanticQueryResponse {
  semantic_query: string;
}

/**
 * Vendor-agnostic semantic query generation node.
 * Generates semantic query keywords from title, description, and nl_query.
 * This is completely independent of vendor - uses natural language description only.
 */
export const getGenerateSemanticQueryNode = ({
  model,
}: GetGenerateSemanticQueryNodeParams): GraphNode => {
  const jsonParser = new JsonOutputParser();
  return async (state) => {
    // Only generate if nl_query exists
    if (!state.nl_query) {
      return { semantic_query: '' };
    }

    const semanticQueryChain = model.pipe(jsonParser);

    const promptMessages = await GENERATE_SEMANTIC_QUERY_PROMPT.formatMessages({
      title: state.original_rule.title,
      description: state.original_rule.description ?? '',
      nl_query: state.nl_query,
    });

    try {
      const semanticResponse = (await semanticQueryChain.invoke(
        promptMessages
      )) as GetSemanticQueryResponse;

      return { semantic_query: semanticResponse.semantic_query || state.nl_query };
    } catch (error) {
      // Fallback: use nl_query as semantic_query if generation fails
      return { semantic_query: state.nl_query };
    }
  };
};
