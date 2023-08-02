/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fillAddFilterForm } from '../../../../tasks/search_bar';
import { openTimeline } from '../../../../tasks/timelines';
import {
  addDiscoverKqlQuery,
  openAddDiscoverFilterPopover,
  submitDiscoverSearchBar,
  switchDataViewTo,
} from '../../../../tasks/discover';
import { navigateFromHeaderTo } from '../../../../tasks/security_header';
import {
  DISCOVER_CONTAINER,
  DISCOVER_QUERY_INPUT,
  DISCOVER_FILTER_BADGES,
  DISCOVER_DATA_VIEW_SWITCHER,
} from '../../../../screens/discover';
import { updateDateRangeInLocalDatePickers } from '../../../../tasks/date_picker';
import { login, visit } from '../../../../tasks/login';
import { createNewTimeline, gotToDiscoverTab } from '../../../../tasks/timeline';
import { ALERTS_URL } from '../../../../urls/navigation';
import { CSP_FINDINGS, TIMELINES } from '../../../../screens/security_header';

const INITIAL_START_DATE = 'Jan 18, 2021 @ 20:33:29.186';
const INITIAL_END_DATE = 'Jan 19, 2024 @ 20:33:29.186';

describe('Discover State', () => {
  beforeEach(() => {
    login();
    visit(ALERTS_URL);
    createNewTimeline();
    gotToDiscoverTab();
    updateDateRangeInLocalDatePickers(DISCOVER_CONTAINER, INITIAL_START_DATE, INITIAL_END_DATE);
  });
  it('should remember kql query when navigating away and back to discover ', () => {
    const kqlQuery = '_id:*';
    addDiscoverKqlQuery(kqlQuery);
    submitDiscoverSearchBar();
    navigateFromHeaderTo(CSP_FINDINGS);
    navigateFromHeaderTo(TIMELINES);
    openTimeline();
    gotToDiscoverTab();
    cy.get(DISCOVER_QUERY_INPUT).should('have.text', kqlQuery);
  });
  it('should remember filters when navigating away and back to discover ', () => {
    openAddDiscoverFilterPopover();
    fillAddFilterForm({
      key: 'agent.type',
      value: 'winlogbeat',
    });
    navigateFromHeaderTo(CSP_FINDINGS);
    navigateFromHeaderTo(TIMELINES);
    openTimeline();
    gotToDiscoverTab();
    cy.get(DISCOVER_FILTER_BADGES).should('have.length', 1);
  });
  it('should remember dataView when navigating away and back to discover ', () => {
    const dataviewName = '.kibana-event-log';
    switchDataViewTo(dataviewName);
    navigateFromHeaderTo(CSP_FINDINGS);
    navigateFromHeaderTo(TIMELINES);
    openTimeline();
    gotToDiscoverTab();
    cy.get(DISCOVER_DATA_VIEW_SWITCHER.BTN).should('contain.text', dataviewName);
  });
  it('should remember timerange when navigating away and back to discover ', () => {});
});
