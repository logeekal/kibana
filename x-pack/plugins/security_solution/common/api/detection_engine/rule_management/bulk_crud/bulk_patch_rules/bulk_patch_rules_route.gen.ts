/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 *
 * info:
 *   title: Bulk Patch API endpoint
 *   version: 2023-10-31
 */

import { z } from 'zod';

import { RulePatchProps } from '../../../model/rule_schema/rule_schemas.gen';
import { BulkCrudRulesResponse } from '../response_schema.gen';

export type BulkPatchRulesRequestBody = z.infer<typeof BulkPatchRulesRequestBody>;
export const BulkPatchRulesRequestBody = z.array(RulePatchProps);
export type BulkPatchRulesRequestBodyInput = z.input<typeof BulkPatchRulesRequestBody>;

export type BulkPatchRulesResponse = z.infer<typeof BulkPatchRulesResponse>;
export const BulkPatchRulesResponse = BulkCrudRulesResponse;
