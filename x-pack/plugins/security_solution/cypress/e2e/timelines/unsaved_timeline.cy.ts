/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MODAL_CONFIRMATION_BTN } from '../../screens/alerts_detection_rules';
import {
  APP_LEAVE_CONFIRM_MODAL,
  CASES_PAGE,
  MANAGE_PAGE,
  OBSERVABILITY_ALERTS_PAGE,
} from '../../screens/kibana_navigation';
import { cleanKibana } from '../../tasks/common';
import {
  navigateFromKibanaCollapsibleTo,
  openKibanaNavigation,
} from '../../tasks/kibana_navigation';
import { login, visit } from '../../tasks/login';
import { closeTimelineUsingToggle } from '../../tasks/security_main';
import { createNewTimeline, populateTimeline, waitForTimelineChanges } from '../../tasks/timeline';
import { HOSTS_URL } from '../../urls/navigation';

describe('Save Timeline Prompts', () => {
  before(() => {
    cleanKibana();
    login();
  });

  beforeEach(() => {
    visit(HOSTS_URL);
    createNewTimeline();
  });

  it('unchanged & unsaved timeline should NOT prompt when user navigates away', () => {
    openKibanaNavigation();
    navigateFromKibanaCollapsibleTo(OBSERVABILITY_ALERTS_PAGE);
    cy.url().should('not.contain', HOSTS_URL);
  });

  it('Changed & unsaved timeline should prompt when user navigates away from security solution', () => {
    populateTimeline();
    waitForTimelineChanges();
    closeTimelineUsingToggle();
    openKibanaNavigation();
    navigateFromKibanaCollapsibleTo(OBSERVABILITY_ALERTS_PAGE);
    cy.get(APP_LEAVE_CONFIRM_MODAL).should('be.visible');
    cy.get(MODAL_CONFIRMATION_BTN).click();
  });

  it('Changed & unsaved timeline should NOT prompt when user navigates away within security solution', () => {
    populateTimeline();

    waitForTimelineChanges();
    closeTimelineUsingToggle();
    // navigate to any other page in security solution
    openKibanaNavigation();
    cy.get(CASES_PAGE).click();
    cy.get(APP_LEAVE_CONFIRM_MODAL).should('not.exist');
  });

  it('Changed & unsaved timeline should prompt when user navigates away within security solution to admin screen', () => {
    populateTimeline();
    waitForTimelineChanges();
    // navigate to any other page in security solution
    openKibanaNavigation();
    cy.get(MANAGE_PAGE).click();
    cy.get(APP_LEAVE_CONFIRM_MODAL).should('be.visible');
    cy.get(MODAL_CONFIRMATION_BTN).click();
  });
});
