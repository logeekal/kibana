/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { AIMessage } from '@langchain/core/messages';
import type { OriginalRule } from '../../../../../../../../common/siem_migrations/model/rule_migration.gen';
import type { MigrationResources } from '../../../common/task/retrievers/resource_retriever';
import type { MigrationComments } from '../../../../../../../../common/siem_migrations/model/common.gen';

/**
 * State for the queryToNaturalLanguage subgraph.
 * Minimal state focused on interpretation task.
 */
export const queryToNLState = Annotation.Root({
  original_rule: Annotation<OriginalRule>(),
  resources: Annotation<MigrationResources>(),
  messages: Annotation<AIMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  nl_query: Annotation<string>({
    reducer: (current, value) => value ?? current,
    default: () => '',
  }),
  comments: Annotation<MigrationComments>({
    default: () => [],
  }),
});

export type QueryToNLState = typeof queryToNLState.State;
