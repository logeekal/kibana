/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useContext } from 'react';
import { FilterGroupContext } from '..';

export const useFilterGroupInternalContext = () => {
  const filterContext = useContext(FilterGroupContext);

  if (!filterContext) {
    throw new Error('FilterContext should only be used inside FilterGroup Wrapper');
  }

  return filterContext;
};
