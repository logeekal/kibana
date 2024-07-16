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
 *   title: Asset Criticality List Schema
 *   version: 1
 */

import { z } from 'zod';

import { AssetCriticalityRecord } from './common.gen';

export type AssetCriticalityListResponse = z.infer<typeof AssetCriticalityListResponse>;
export const AssetCriticalityListResponse = z.object({
  records: z.array(AssetCriticalityRecord),
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(1000),
  total: z.number().int().min(0),
});
