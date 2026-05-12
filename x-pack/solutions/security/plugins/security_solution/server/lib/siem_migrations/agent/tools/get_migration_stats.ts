/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { StaticToolRegistration } from '@kbn/agent-builder-server';
import {
  GetRuleMigrationStatsRequestParams,
} from '../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import type { SiemMigrationsClientGetter } from './create_client_factory';

export const SIEM_MIGRATION_GET_MIGRATION_STATS_TOOL_ID = 'security.siem_migration.get_migration_stats';

const getMigrationStatsSchema = GetRuleMigrationStatsRequestParams;

/**
 * Tool to get detailed stats for a specific SIEM rule migration.
 * Returns migration status (ready, running, interrupted, stopped, finished), rule counts, and execution details.
 * Use this to check if a migration is currently running or has been interrupted.
 */
export function createGetMigrationStatsTool(
  getClient: SiemMigrationsClientGetter
): StaticToolRegistration<typeof getMigrationStatsSchema> {
  return {
    id: SIEM_MIGRATION_GET_MIGRATION_STATS_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Get detailed statistics for a specific SIEM rule migration. ' +
      'Returns migration status (ready, running, interrupted, stopped, finished), rule counts (total, pending, processing, completed, failed), and execution details. ' +
      'Use this tool to check if a migration is currently running, has been interrupted, or has completed. ' +
      'The status field indicates the current state: "running" means migration is in progress, "interrupted" means it was stopped unexpectedly (e.g., server restart), "stopped" means it was explicitly stopped by user, "finished" means all rules have been processed, and "ready" means migration hasn\'t started yet.',
    schema: getMigrationStatsSchema,
    tags: ['security', 'siem-migration'],
    handler: async ({ migration_id }, context) => {
      try {
        const client = await getClient({
          request: context.request,
          spaceId: context.spaceId,
          esClient: context.esClient,
          savedObjectsClient: context.savedObjectsClient,
        });
        const stats = await client.task.getStats(migration_id);

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                id: stats.id,
                name: stats.name,
                status: stats.status,
                items: stats.items,
                created_at: stats.created_at,
                last_updated_at: stats.last_updated_at,
                last_execution: stats.last_execution,
              },
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.logger.error(`Error fetching migration stats: ${errorMessage}`);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch migration stats: ${errorMessage}`,
              },
            },
          ],
        };
      }
    },
  };
}
