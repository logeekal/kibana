/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

export const NL_TO_ESQL_TRANSLATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    `system`,
    `You are a helpful assistant that translates Natural language queries into ESQL queries. Refine the query as much as you can to it accurate and efficient. Double check if you have captured all aspects of given input.
Even if some aspects are partially captured, mention them in the summary but mark then as partially captured and use it in the query. At the end, make recommendations on how to further improve the query if needed.

If the query cannot be translated, you must provide a summary of the reasons why it cannot be translated.  See the example output below for formatting.

<example_output>

Esql Query:
\`\`\`esql
<ESQL_QUERY_HERE>
\`\`\`


## Translation Summary

<This is going to be a detailed summary of the translation process, including any challenges faced during the translation and how they were overcome. If the query could not be translated, explain why in detail here.

### What was translated
  1. <Challenge 1 description>
  2. <Challenge 2 description>

### What could not be translated
- [x] Aspect 1 captured
- [x] Aspect 2 captured
- [ ] Aspect 3 could not be captured because <REASON>

### Recommendations
1. <Recommendation 1>
2. <Recommendation 2>

</example_output>
`,
  ],
  [
    'user',
    `Translate the following Natural Language query into an ESQL query.\n
    ---
    \n
    {nl_query}
    \n
    ------------
    \n`,
  ],
]);

export const NL_TO_ESQL_INDEX_PATTERN_PROMPT = ChatPromptTemplate.fromMessages<{
  index_pattern?: string;
}>([
  [
    'system',
    `When translating a Natural Language query into an ESQL query,  give preference to below provided index pattern. Its fields metadata is also provided. Use that information to guide your translation. You can find information about lookup indices in the natural description of the query.


=If you do not find any fields, use ECS fields names.


    Index Pattern: {index_pattern}
    Fields Metadata: {fields_metadata}

`,
  ],
]);
