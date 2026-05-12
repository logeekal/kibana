/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, KibanaRequest, AuthenticatedUser } from '@kbn/core/server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { IRequestContextFactory } from '../../../../request_context_factory';
import type { SecuritySolutionApiRequestHandlerContext } from '../../../../types';
import type { SiemMigrationsService } from '../../siem_migrations_service';
import type { SiemRuleMigrationsClient } from '../../rules/siem_rule_migrations_service';
import type {
  SecuritySolutionPluginStart,
  SecuritySolutionPluginStartDependencies,
} from '../../../../plugin_contract';
import { buildMlAuthz } from '../../../machine_learning/authz';
import { createDetectionRulesClient } from '../../../detection_engine/rule_management/logic/detection_rules_client/detection_rules_client';
import type { ProductFeaturesService } from '../../../product_features_service';
import type { ExperimentalFeatures } from '../../../../../common';

/**
 * Resolves the authenticated user, falling back to the ES security.authenticate API
 * when the Kibana session-based getCurrentUser returns null (e.g. Task Manager fakeRequests
 * authenticated via API key, which is the default Agent Builder execution mode).
 */
async function resolveCurrentUser(
  getCurrentUser: (request: KibanaRequest) => AuthenticatedUser | null,
  request: KibanaRequest,
  esClient: IScopedClusterClient
): Promise<AuthenticatedUser> {
  const sessionUser = getCurrentUser(request);
  if (sessionUser) {
    return sessionUser;
  }

  const authResponse = await esClient.asCurrentUser.security.authenticate();
  return {
    username: authResponse.username,
    roles: authResponse.roles,
    enabled: authResponse.enabled,
    authentication_realm: authResponse.authentication_realm,
    lookup_realm: authResponse.lookup_realm,
    authentication_provider: { type: 'api_key', name: '__fallback' },
    authentication_type: authResponse.authentication_type,
    elastic_cloud_user: false,
  };
}

export interface SiemMigrationsClientGetterParams {
  request: KibanaRequest;
  spaceId: string;
  esClient: IScopedClusterClient;
  savedObjectsClient: SavedObjectsClientContract;
}

export type SiemMigrationsClientGetter = (
  params: SiemMigrationsClientGetterParams
) => Promise<SiemRuleMigrationsClient>;

export type SecuritySolutionContextGetter = (params: {
  request: KibanaRequest;
  esClient: IScopedClusterClient;
}) => Promise<{
  securitySolutionContext: SecuritySolutionApiRequestHandlerContext;
  savedObjectsClient: SavedObjectsClientContract;
  rulesClient: RulesClient;
}>;

/**
 * Creates a factory function that produces scoped SIEM migrations clients.
 * This factory is used by tools to get a properly scoped client for each request.
 */
export function createSiemMigrationsClientFactory({
  core,
  siemMigrationsService,
  experimentalFeatures,
}: {
  core: CoreSetup<SecuritySolutionPluginStartDependencies, SecuritySolutionPluginStart>;
  siemMigrationsService: SiemMigrationsService;
  experimentalFeatures: ExperimentalFeatures;
}): SiemMigrationsClientGetter {
  return async ({
    request,
    spaceId,
    esClient,
    savedObjectsClient,
  }: SiemMigrationsClientGetterParams): Promise<SiemRuleMigrationsClient> => {
    const [coreStart, plugins] = await core.getStartServices();

    const currentUser = await resolveCurrentUser(
      coreStart.security.authc.getCurrentUser,
      request,
      esClient
    );

    const rulesClient = await plugins.alerting.getRulesClientWithRequest(request);
    const actionsClient = await plugins.actions.getActionsClientWithRequest(request);

    return siemMigrationsService.createRulesClient({
      request,
      currentUser,
      spaceId,
      dependencies: {
        inferenceService: plugins.inference,
        rulesClient,
        actionsClient,
        savedObjectsClient,
        packageService: plugins.fleet?.packageService,
        telemetry: coreStart.analytics,
        experimentalFeatures,
      },
    });
  };
}

/**
 * Creates a factory function that produces Security Solution context and related clients.
 * This factory is used by tools that need access to Security Solution services like detection rules client.
 */
export function createSecuritySolutionContextFactory({
  core,
  requestContextFactory,
  plugins: { licensing, productFeaturesService, ml },
}: {
  core: CoreSetup<SecuritySolutionPluginStartDependencies, SecuritySolutionPluginStart>;
  requestContextFactory: IRequestContextFactory;
  plugins: {
    licensing: LicensingPluginSetup;
    productFeaturesService: ProductFeaturesService;
  };
}): SecuritySolutionContextGetter {
  return async ({ request, esClient }) => {
    const [coreStart, plugins] = await core.getStartServices();

    const currentUser = await resolveCurrentUser(
      coreStart.security.authc.getCurrentUser,
      request,
      esClient
    );

    const rulesClient = await plugins.alerting.getRulesClientWithRequest(request);
    const savedObjectsClient = coreStart.savedObjects.getScopedClient(request);

    const license = await plugins.licensing.getLicense();
    const actionsClient = await plugins.actions.getActionsClientWithRequest(request);

    const mlAuthz = buildMlAuthz({
      license,
      ml,
      request,
      savedObjectsClient,
    });

    const detectionRulesClient = createDetectionRulesClient({
      rulesClient,
      actionsClient,
      savedObjectsClient,
      mlAuthz,
      productFeaturesService,
      license,
    });

    return {
      detectionRulesClient,
      savedObjectsClient,
      rulesClient,
    };
  };
}
