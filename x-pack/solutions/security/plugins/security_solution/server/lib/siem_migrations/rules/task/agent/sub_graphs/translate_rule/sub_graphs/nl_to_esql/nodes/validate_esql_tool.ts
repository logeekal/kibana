/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from '@kbn/zod';
import { validateQuery } from '@kbn/esql-language';

export const createValidateEsqlTool = () => {
  return new DynamicStructuredTool({
    name: 'validate_esql',
    description: `Validates an ES|QL query syntax. Returns validation errors if the query is invalid, or success if valid.
Use this tool after generating an ESQL query to ensure it's syntactically correct before finalizing.`,
    schema: z.object({
      query: z.string().describe('The ES|QL query to validate'),
    }),
    func: async ({ query }) => {
      try {
        const validationResult = await validateQuery(query);
        const errors = validationResult.errors;
        const warnings = validationResult.warnings;

        if (errors.length > 0) {
          return JSON.stringify({
            valid: false,
            errors,
            warnings,
          });
        }

        return JSON.stringify({
          valid: true,
          warnings: warnings.map((warn) => ({
            message: warn.text,
            code: warn.code,
            location: warn.location,
          })),
        });
      } catch (error) {
        return JSON.stringify({
          valid: false,
          errors: [
            {
              message: error instanceof Error ? error.message : String(error),
              code: 'VALIDATION_ERROR',
            },
          ],
        });
      }
    },
  });
};
