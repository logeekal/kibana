/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';
import { createFailError } from '@kbn/dev-cli-errors';
import {
  readValidationRunFlags,
  resolveValidationBaseContext,
  VALIDATION_RUN_HELP,
  VALIDATION_RUN_STRING_FLAGS,
} from '@kbn/dev-validation-runner';

import { formatYamlLintErrors } from './yaml_lint/lint_yaml_files';
import { executeYamlLintValidation } from './yaml_lint/run_yaml_lint_contract';

run(
  async ({ flags, flagsReader, log }) => {
    const targets = flags._.map(String);
    const validationFlags = readValidationRunFlags(flagsReader);
    const fix = flagsReader.boolean('fix');
    const syntaxOnly = flagsReader.boolean('syntax-only');
    if (fix && syntaxOnly) {
      throw createFailError(
        'Cannot combine --fix with --syntax-only because syntax errors cannot be fixed.'
      );
    }
    if (targets.length > 0 && Object.values(validationFlags).some((value) => value !== undefined)) {
      throw createFailError(
        'Cannot combine explicit file or directory targets with validation scope flags.'
      );
    }

    const baseContext =
      targets.length === 0
        ? await resolveValidationBaseContext({
            flags: validationFlags,
            runnerDescription: 'YAML lint',
            onWarning: (message) => log.warning(message),
          })
        : undefined;

    const result = await executeYamlLintValidation({
      baseContext,
      targets,
      checkStyle: !syntaxOnly,
      fix,
    });

    for (const warning of result.warnings) {
      log.warning(`${warning.filePath}:\n${warning.message}`);
    }

    if (result.fixedFiles.length > 0) {
      log.success(`Formatted ${result.fixedFiles.length} YAML file(s).`);
    }

    if (result.errors.length > 0) {
      throw createFailError(formatYamlLintErrors(result.errors));
    }

    log.success(
      `Checked ${result.checkedFiles.length} YAML file(s); excluded ${result.excludedFiles.length} generated file(s).`
    );
  },
  {
    description: `
      Validate YAML syntax and canonical Prettier formatting.

      Explicit paths may identify files or directories. Generated YAML is
      excluded consistently from changed-file, targeted, and full runs.

      Examples:
        node scripts/yaml_lint --scope branch
        node scripts/yaml_lint --scope full
        node scripts/yaml_lint x-pack/solutions/security --fix
    `,
    flags: {
      string: [...VALIDATION_RUN_STRING_FLAGS],
      boolean: ['fix', 'syntax-only'],
      default: {
        fix: false,
        'syntax-only': false,
      },
      help: [
        ...VALIDATION_RUN_HELP,
        { flag: '--fix', description: 'Format valid, in-scope YAML files' },
        { flag: '--syntax-only', description: 'Check syntax without checking formatting' },
      ],
    },
  }
);
