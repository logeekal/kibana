/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CoreStart } from '@kbn/core/public';
import React from 'react';
import { KibanaReactOverlays } from '@kbn/kibana-react-plugin/public';
import { SourceModal } from '../components/source_modal';
import { IndexPatternSavedObject } from '../types';

export function openSourceModal(
  {
    overlays,
    http,
    uiSettings,
  }: {
    overlays: KibanaReactOverlays;
    http: CoreStart['http'];
    uiSettings: CoreStart['uiSettings'];
  },
  onSelected: (indexPattern: IndexPatternSavedObject) => void
) {
  const modalRef = overlays.openModal(
    <SourceModal
      uiSettings={uiSettings}
      http={http}
      onIndexPatternSelected={(indexPattern) => {
        onSelected(indexPattern);
        modalRef.close();
      }}
    />
  );
}
