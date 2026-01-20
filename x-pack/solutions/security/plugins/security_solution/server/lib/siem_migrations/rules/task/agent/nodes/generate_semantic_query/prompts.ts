/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Vendor-agnostic semantic query generation prompt.
 * Generates keywords from title, description, and natural language query description.
 * This is completely independent of vendor - works with any natural language description.
 */
export const GENERATE_SEMANTIC_QUERY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a helpful assistant that helps in translating provided titles, descriptions, and natural language query descriptions into a single summary of keywords specifically crafted to be used as a semantic search query.

The keywords should be short, concise, and include terms that are valid for the use case. The data provided are collected from SIEM detection rules, and it is trying to match the description of a list of data sources, so provide good keywords that match this use case.

Try to also detect what sort of vendor, solution or technology is required and add these as keywords as well. Some examples would be to identify if its cloud, which vendor, network, host, endpoint, etc.

<guidelines>
- The query should be short and concise.
- Include keywords that are relevant to the use case.
- Add related keywords you detected from the title, description, and natural language query, like one or more vendor, product, cloud provider, OS platform etc.
- Always reply with a JSON object with the key "semantic_query" and the value as the semantic search query inside three backticks as shown in the below example.
- If the related query focuses on Endpoint datamodel, make sure that "endpoint", "security" keywords are included.
- Extract keywords from the natural language description that accurately represent the core concepts and intent.
</guidelines>

<example_response>
A: Please find the semantic_query keywords JSON object below:
\`\`\`json
{{"semantic_query": "windows host endpoint netsh.exe process creation command-line utility network configuration persistence proxy dll execution sysmon event id 1"}}
\`\`\`
</example_response>`,
  ],
  [
    'human',
    `Create a collection of keywords specifically crafted to be used as a semantic search query from the following detection rule information:

Title: {title}
Description: {description}
Natural Language Query Description: {nl_query}

Go through the relevant title, description, and natural language query description and create a collection of keywords specifically crafted to be used as a semantic search query.`,
  ],
  ['ai', 'Please find the semantic_query keywords JSON object below:'],
]);
