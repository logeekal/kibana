/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ControlGroupInput, OptionsListEmbeddableInput } from '@kbn/controls-plugin/common';
import type { AddOptionsListControlProps } from '@kbn/controls-plugin/public';
import type { Filter } from '@kbn/es-query';

export type FilterUrlFormat = Record<
  string,
  Pick<OptionsListEmbeddableInput, 'selectedOptions' | 'title' | 'fieldName'>
>;

export interface FilterContextType {
  allControls: FilterItemObj[] | undefined;
  addControl: (controls: FilterItemObj) => void;
}

export type FilterItemObj = Omit<AddOptionsListControlProps, 'controlId' | 'dataViewId'>;

export type FilterGroupProps = {
  dataViewId: string;
  onFilterChange?: (newFilters: Filter[]) => void;
  initialControls: FilterItemObj[];
} & Pick<ControlGroupInput, 'timeRange' | 'filters' | 'query' | 'chainingSystem'>;
