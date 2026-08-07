/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { stat } from 'fs/promises';
import Path from 'path';

import type { ValidationBaseContext } from '@kbn/dev-validation-runner';
import { getRepoFiles } from '@kbn/get-repo-files';
import { REPO_ROOT } from '@kbn/repo-info';

import {
  lintYamlFiles,
  type LintYamlFilesOptions,
  type LintYamlFilesResult,
} from './lint_yaml_files';

let trackedRepoFiles: Promise<string[]> | undefined;

const getTrackedRepoFiles = (): Promise<string[]> => {
  trackedRepoFiles ??= getRepoFiles().then((files) => files.map(({ repoRel }) => repoRel));
  return trackedRepoFiles;
};

const isInsideRepo = (absolutePath: string): boolean => {
  const relativePath = Path.relative(REPO_ROOT, absolutePath);
  return (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${Path.sep}`) &&
    !Path.isAbsolute(relativePath)
  );
};

const collectTargetFiles = async (target: string): Promise<string[]> => {
  const absoluteTarget = Path.resolve(REPO_ROOT, target);
  if (!isInsideRepo(absoluteTarget)) {
    throw new Error(`YAML lint target must be inside the repository: ${target}`);
  }

  const targetStat = await stat(absoluteTarget);
  if (targetStat.isFile()) {
    return [Path.relative(REPO_ROOT, absoluteTarget)];
  }
  if (!targetStat.isDirectory()) {
    return [];
  }

  const relativeTarget = Path.relative(REPO_ROOT, absoluteTarget).split(Path.sep).join('/');
  const directoryPrefix = relativeTarget ? `${relativeTarget}/` : '';
  return (await getTrackedRepoFiles()).filter((filePath) => filePath.startsWith(directoryPrefix));
};

export const resolveYamlLintFiles = async ({
  baseContext,
  targets = [],
}: {
  baseContext?: ValidationBaseContext;
  targets?: readonly string[];
}): Promise<string[]> => {
  if (targets.length > 0) {
    const files = await Promise.all(targets.map(collectTargetFiles));
    return files.flat();
  }

  if (!baseContext) {
    throw new Error('A validation scope or explicit target is required.');
  }

  if (baseContext.mode === 'direct_target') {
    return collectTargetFiles(baseContext.directTarget);
  }

  if (baseContext.runContext.kind === 'skip') {
    return [];
  }

  if (baseContext.runContext.kind === 'full') {
    return getTrackedRepoFiles();
  }

  return baseContext.runContext.changedFiles;
};

export interface ExecuteYamlLintValidationOptions extends LintYamlFilesOptions {
  readonly baseContext?: ValidationBaseContext;
  readonly targets?: readonly string[];
}

export const executeYamlLintValidation = async (
  options: ExecuteYamlLintValidationOptions
): Promise<LintYamlFilesResult> => {
  const candidatePaths = await resolveYamlLintFiles(options);
  return lintYamlFiles(candidatePaths, options);
};
