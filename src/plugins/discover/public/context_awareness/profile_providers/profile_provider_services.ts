/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createLogsContextService, LogsContextService } from '@kbn/discover-utils';
import { DiscoverFeaturesService } from '@kbn/discover-shared-plugin/public/services/discover_features';
import { DiscoverStartPlugins } from '../../types';

/**
 * Dependencies required by profile provider implementations
 */
export interface ProfileProviderDeps {
  plugins: DiscoverStartPlugins;
}

/**
 * Services provided to profile provider implementations
 */
export interface ProfileProviderServices {
  /**
   * A service containing methods used for logs profiles
   */
  logsContextService: LogsContextService;
  discoverFeaturesRegistry: DiscoverFeaturesService['registry'];
}

/**
 * Creates the profile provider services
 * @param _deps Profile provider dependencies
 * @returns Profile provider services
 */
export const createProfileProviderServices = async ({
  plugins,
}: ProfileProviderDeps): Promise<ProfileProviderServices> => {
  return {
    logsContextService: await createLogsContextService({
      logsDataAccessPlugin: plugins.logsDataAccess,
    }),
    discoverFeaturesRegistry: plugins?.discoverShared.features.registry,
  };
};
