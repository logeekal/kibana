/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import { SecurityAgentBuilderAttachments } from '../../../common/constants';
import { registerAttachmentUiDefinitions } from '.';

describe('registerAttachmentUiDefinitions', () => {
  const mockAddAttachmentType = jest.fn();
  const mockAttachments: AttachmentServiceStartContract = {
    addAttachmentType: mockAddAttachmentType,
  } as unknown as AttachmentServiceStartContract;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns attachmentLabel when provided in alert attachment data', () => {
    registerAttachmentUiDefinitions(mockAttachments);

    const ruleCall = mockAddAttachmentType.mock.calls.find(
      (call: unknown[]) => call[0] === SecurityAgentBuilderAttachments.alert
    );
    const config = ruleCall![1];

    const attachment = {
      id: 'test',
      type: SecurityAgentBuilderAttachments.alert,
      data: { text: '{}', attachmentLabel: 'My Test Security Rule Alert' },
    };
    expect(config.getLabel(attachment)).toBe('My Test Security Rule Alert');
  });

  it('returns default label when attachmentLabel is not provided', () => {
    registerAttachmentUiDefinitions(mockAttachments);

    const ruleCall = mockAddAttachmentType.mock.calls.find(
      (call: unknown[]) => call[0] === SecurityAgentBuilderAttachments.alert
    );
    const config = ruleCall![1];

    const attachment = {
      id: 'test',
      type: SecurityAgentBuilderAttachments.alert,
      data: { text: '{}' },
    };
    expect(config.getLabel(attachment)).toBe('Security Alert');
  });

  it('registers the SIEM migration rule attachment type', () => {
    registerAttachmentUiDefinitions(mockAttachments);

    const migrationRuleCall = mockAddAttachmentType.mock.calls.find(
      (call: unknown[]) => call[0] === SecurityAgentBuilderAttachments.siemMigrationRule
    );
    const config = migrationRuleCall![1];

    const attachment = {
      id: 'test',
      type: SecurityAgentBuilderAttachments.siemMigrationRule,
      data: { attachmentLabel: 'Migration Rule: Suspicious PowerShell' },
    };

    expect(config.getLabel(attachment)).toBe('Migration Rule: Suspicious PowerShell');
    expect(config.getIcon()).toBe('document');
  });

  it('does not register the security.entity attachment type (owned by registerEntityAttachment)', () => {
    registerAttachmentUiDefinitions(mockAttachments);

    const entityCall = mockAddAttachmentType.mock.calls.find(
      (call: unknown[]) => call[0] === SecurityAgentBuilderAttachments.entity
    );
    expect(entityCall).toBeUndefined();
  });
});
