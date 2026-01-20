/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';

export const nlToEsqlState = Annotation.Root({
  // Inputs
  nl_query: Annotation<string>({
    reducer: (current, value) => value ?? current,
    default: () => '',
  }),
  index_pattern: Annotation<string | undefined>({
    reducer: (current, value) => value ?? current,
    default: () => undefined,
  }),
  // Conversation state
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // Outputs
  esql_query: Annotation<string | undefined>({
    reducer: (current, value) => value ?? current,
    default: () => undefined,
  }),
  translation_comments: Annotation<string[]>({
    reducer: (current, value) => (value ? (current ?? []).concat(value) : current),
    default: () => [],
  }),
});
