/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { RuleMigrationRule } from '../../../../../common/siem_migrations/model/rule_migration.gen';
import { SIEM_MIGRATION_RULE_ATTACHMENT_TYPE_ID } from '../../../../../common/constants';
import { useAgentBuilderAttachment } from '../../../../agent_builder/hooks/use_agent_builder_attachment';

export interface UseMigrationRuleAttachmentResult {
  /**
   * Function to open the agent builder flyout with migration rule attachment
   */
  openAgentBuilderFlyout: () => void;
}

/**
 * Hook to handle SIEM migration rule attachment functionality.
 * Opens a conversation flyout with the migration rule attachment and prompts the user
 * about what they want to do with the rule.
 */
export const useMigrationRuleAttachment = (
  migrationRule: RuleMigrationRule
): UseMigrationRuleAttachmentResult => {
  const attachmentData = useMemo(
    () => ({
      migration_id: migrationRule.migration_id,
      rule_id: migrationRule.id,
      attachmentLabel: `Migration Rule: ${migrationRule.original_rule.title}`,
    }),
    [migrationRule]
  );

  const attachmentPrompt = useMemo(
    () =>
      `A migration rule item has been attached. it repesents \`original_rule\` and \`elastic_rule\` which represent vendor rule and converted Elastic-like ESQL rule. Describe to the user your evaulation about the conversion and ask them what they would like to do next. Explain all the capabilities you have based on the tools available.`,
    []
  );

  const { openAgentBuilderFlyout } = useAgentBuilderAttachment({
    attachmentType: SIEM_MIGRATION_RULE_ATTACHMENT_TYPE_ID,
    attachmentData,
    attachmentPrompt,
  });

  return {
    openAgentBuilderFlyout,
  };
};
