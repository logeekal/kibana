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
import type { CoreSetup } from '@kbn/core/server';
import { isSupportedConnector } from '@kbn/inference-common';
import type {
  SecuritySolutionPluginStart,
  SecuritySolutionPluginStartDependencies,
} from '../../../../plugin_contract';

export const SIEM_MIGRATION_LIST_CONNECTORS_TOOL_ID = 'security.siem_migration.list_connectors';

const listConnectorsSchema = z.object({
  actionTypeId: z
    .string()
    .optional()
    .describe('Optional filter to return only connectors of a specific AI action type (e.g., ".gen-ai", ".bedrock", ".gemini", ".inference"). Only AI connectors are returned regardless of this parameter.'),
});

/**
 * Tool to list all available AI connectors (actions) in Kibana.
 * Only AI/inference connectors are returned (e.g., OpenAI, Bedrock, Gemini, Inference endpoints).
 * This is particularly useful for discovering AI connectors before using them in the start_migration tool.
 */
export function createListConnectorsTool(
  core: CoreSetup<SecuritySolutionPluginStartDependencies, SecuritySolutionPluginStart>
): StaticToolRegistration<typeof listConnectorsSchema> {
  return {
    id: SIEM_MIGRATION_LIST_CONNECTORS_TOOL_ID,
    type: ToolType.builtin,
    description:
      'List all available AI connectors (actions) in Kibana. ' +
      'Only AI/inference connectors are returned (e.g., OpenAI, Bedrock, Gemini, Inference endpoints). ' +
      'Use this tool to discover available AI connectors before using them in the start_migration tool. ' +
      'The optional actionTypeId parameter can be used to further filter connectors by their specific AI action type.',
    schema: listConnectorsSchema,
    tags: ['security', 'siem-migration', 'connectors', 'ai'],
    handler: async ({ actionTypeId }, context) => {
      try {
        const [, pluginsStart] = await core.getStartServices();
        const actionsClient = await pluginsStart.actions.getActionsClientWithRequest(context.request);
        const allConnectors = await actionsClient.getAll();

        // Filter to only AI/inference connectors
        const aiConnectors = allConnectors.filter((connector) => isSupportedConnector(connector));

        // Apply optional actionTypeId filter if provided
        const connectors = aiConnectors
          .filter((connector) => (actionTypeId ? connector.actionTypeId === actionTypeId : true))
          .map((connector) => ({
            id: connector.id,
            name: connector.name,
            actionTypeId: connector.actionTypeId,
            config: connector.config,
            isPreconfigured: connector.isPreconfigured,
            isDeprecated: connector.isDeprecated,
            isSystemAction: connector.isSystemAction,
            isMissingSecrets: connector.isMissingSecrets,
            isConnectorTypeDeprecated: connector.isConnectorTypeDeprecated,
          }));

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                connectors,
                total: connectors.length,
              },
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to list connectors: ${errorMessage}`,
              },
            },
          ],
        };
      }
    },
  };
}
