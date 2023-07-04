/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Dataset } from '../../../common/datasets';
import { encodeDatasetSelection } from './encoding';
import { DatasetSelectionStrategy, SingleDatasetSelectionPayload } from './types';

export class SingleDatasetSelection implements DatasetSelectionStrategy {
  selectionType: 'single';
  selection: {
    name?: string;
    version?: string;
    dataset: Dataset;
  };

  private constructor(dataset: Dataset) {
    this.selectionType = 'single';
    this.selection = {
      name: dataset.parentIntegration?.name,
      version: dataset.parentIntegration?.version,
      dataset,
    };
  }

  toDataviewSpec() {
    const { name, title } = this.selection.dataset.toDataviewSpec();
    return {
      id: this.toURLSelectionId(),
      name,
      title,
    };
  }

  toURLSelectionId() {
    return encodeDatasetSelection({
      selectionType: this.selectionType,
      selection: {
        name: this.selection.name,
        version: this.selection.version,
        dataset: this.selection.dataset.toPlain(),
      },
    });
  }

  public static fromSelection(selection: SingleDatasetSelectionPayload) {
    const { name, version, dataset } = selection;

    // Attempt reconstructing the integration object
    const integration = name && version ? { name, version } : undefined;
    const datasetInstance = Dataset.create(dataset, integration);

    return new SingleDatasetSelection(datasetInstance);
  }

  public static create(dataset: Dataset) {
    return new SingleDatasetSelection(dataset);
  }
}
