/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import SimpleGit from 'simple-git';

import { run } from '@kbn/dev-cli-runner';
import { createFlagError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import * as Eslint from './eslint';
import * as Stylelint from './stylelint';

import { getFilesForCommit, runFileCasingCheck } from './precommit_hook';
import { checkSemverRanges } from './no_pkg_semver_ranges';
import { formatYamlLintErrors, lintYamlFiles } from './yaml_lint/lint_yaml_files';

class CheckResult {
  constructor(checkName) {
    this.checkName = checkName;
    this.errors = [];
    this.succeeded = true;
  }

  addError(error) {
    this.succeeded = false;
    this.errors.push(error);
  }

  toString() {
    if (this.succeeded) {
      return `✓ ${this.checkName}: Passed`;
    } else {
      return [`✗ ${this.checkName}: Failed`, ...this.errors.map((err) => `  - ${err}`)].join('\n');
    }
  }
}

class PrecommitCheck {
  constructor(name) {
    this.name = name;
  }

  async execute() {
    throw new Error('execute() must be implemented by check class');
  }

  async runSafely(log, files, options) {
    const result = new CheckResult(this.name);
    try {
      await this.execute(log, files, options);
    } catch (error) {
      if (error.errors) {
        error.errors.forEach((err) => result.addError(err.message || err.toString()));
      } else {
        result.addError(error.message || error.toString());
      }
    }
    return result;
  }
}

class FileCasingCheck extends PrecommitCheck {
  constructor() {
    super('File Casing');
  }

  async execute(log, files) {
    await runFileCasingCheck(log, files);
  }
}

class LinterCheck extends PrecommitCheck {
  constructor(name, linter) {
    super(name);
    this.linter = linter;
  }

  async execute(log, files, options) {
    const filesToLint = await this.linter.pickFilesToLint(log, files);
    if (filesToLint.length > 0) {
      const result = await this.linter.lintFiles(log, filesToLint, {
        fix: options.fix,
      });

      if (result?.failedFiles?.length > 0) {
        throw new Error(`${this.name} errors in ${result.failedFiles.length} file(s)`);
      }

      if (options.fix && options.stage) {
        const simpleGit = new SimpleGit(REPO_ROOT);
        await simpleGit.add(filesToLint);
      }
    }
  }
}

class YamlLintCheck extends PrecommitCheck {
  constructor() {
    super('YAML Lint');
  }

  async execute(log, files, options) {
    const result = await lintYamlFiles(
      files.map((file) => file.getRelativePath()),
      { fix: options.fix }
    );

    if (result.checkedFiles.length === 0) {
      log.verbose('No YAML files to check');
      return;
    }

    log.verbose(`Checking ${result.checkedFiles.length} YAML files`);
    for (const warning of result.warnings) {
      log.warning(`${warning.filePath}:\n${warning.message}`);
    }

    if (options.fix && options.stage && result.fixedFiles.length > 0) {
      const simpleGit = new SimpleGit(REPO_ROOT);
      await simpleGit.add(result.fixedFiles);
    }

    if (result.errors.length > 0) {
      throw new Error(formatYamlLintErrors(result.errors));
    }
  }
}

class SemverRangesCheck extends PrecommitCheck {
  constructor() {
    super('Semver Ranges');
  }

  async execute(log, files, options) {
    log.verbose('Checking for semver ranges in package.json');

    try {
      const result = checkSemverRanges({ fix: options.fix });
      if (result.totalFixes > 0) {
        log.info(`Fixed ${result.totalFixes} semver ranges in package.json`);
      }
    } catch (error) {
      throw error;
    }
  }
}

const PRECOMMIT_CHECKS = [
  new FileCasingCheck(),
  new LinterCheck('ESLint', Eslint),
  new LinterCheck('StyleLint', Stylelint),
  new YamlLintCheck(),
  new SemverRangesCheck(),
];

run(
  async ({ log, flags }) => {
    process.env.IS_KIBANA_PRECOMIT_HOOK = 'true';

    const files = await getFilesForCommit(flags.ref, {
      includeUntracked: Boolean(flags['include-untracked']),
    });

    const maxFilesCount = flags['max-files']
      ? Number.parseInt(String(flags['max-files']), 10)
      : undefined;
    if (maxFilesCount !== undefined && (!Number.isFinite(maxFilesCount) || maxFilesCount < 1)) {
      throw createFlagError('expected --max-files to be a number greater than 0');
    }

    if (maxFilesCount && files.length > maxFilesCount) {
      log.warning(
        `--max-files is set to ${maxFilesCount} and ${files.length} were discovered. The current script execution will be skipped.`
      );
      return;
    }

    log.verbose('Running pre-commit checks...');
    const results = await Promise.all(
      PRECOMMIT_CHECKS.map(async (check) => {
        const startTime = Date.now();
        const result = await check.runSafely(log, files, {
          fix: flags.fix,
          stage: flags.stage,
        });
        const duration = Date.now() - startTime;
        log.verbose(`${check.name} completed in ${duration}ms`);
        return result;
      })
    );

    const failedChecks = results.filter((result) => !result.succeeded);

    if (failedChecks.length > 0) {
      const errorReport = [
        '\nPre-commit checks failed:',
        ...results.map((result) => result.toString()),
        '\nPlease fix the above issues before committing.',
      ].join('\n');

      throw new Error(errorReport);
    }

    log.success('All pre-commit checks passed!');
  },
  {
    description: `
    Run checks on files that are staged for commit by default
  `,
    flags: {
      boolean: ['fix', 'stage', 'include-untracked'],
      string: ['max-files', 'ref'],
      default: {
        fix: false,
        stage: true,
        'include-untracked': false,
      },
      help: `
        --fix              Execute checks with possible fixes
        --max-files        Max files number to check against. If exceeded the script will skip the execution
        --ref              Run checks against any git ref files (example HEAD or <commit_sha>) instead of running against staged ones
        --include-untracked Include untracked files in addition to diff files
        --no-stage         By default when using --fix the changes are staged, use --no-stage to disable that behavior
      `,
    },
  }
);
