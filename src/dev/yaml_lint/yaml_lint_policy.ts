/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

export interface YamlLintExclusion {
  readonly description: string;
  readonly matches: (repoRelativePath: string) => boolean;
}

const normalizePath = (filePath: string): string => filePath.split(Path.sep).join('/');

/**
 * Generated YAML is owned by its generator and must not be rewritten by the
 * repository YAML linter. Every exclusion is intentionally narrow and carries
 * its rationale here so that generated files cannot be added ad hoc by callers.
 */
export const YAML_LINT_EXCLUSIONS: readonly YamlLintExclusion[] = [
  {
    description: 'generated OpenAPI bundles',
    matches: (filePath) => filePath.startsWith('oas_docs/output/'),
  },
  {
    description: 'Moon-generated project configuration',
    matches: (filePath) => Path.posix.basename(filePath) === 'moon.yml',
  },
  {
    description: 'generated GitHub workflow lock files',
    matches: (filePath) =>
      filePath.startsWith('.github/workflows/') && filePath.endsWith('.lock.yml'),
  },
  {
    description: 'generated changelog entries',
    matches: (filePath) => filePath.startsWith('docs/changelog/'),
  },
  {
    description: 'generated Buildkite pipeline location index',
    matches: (filePath) => filePath === '.buildkite/pipeline-resource-definitions/locations.yml',
  },
  {
    description: 'generated bundled OpenAPI schemas',
    matches: (filePath) => filePath.endsWith('.bundled.schema.yaml'),
  },
] as const;

export const getYamlLintExclusion = (repoRelativePath: string): YamlLintExclusion | undefined => {
  const normalizedPath = normalizePath(repoRelativePath);
  return YAML_LINT_EXCLUSIONS.find(({ matches }) => matches(normalizedPath));
};

export const isYamlFile = (filePath: string): boolean => {
  const extension = Path.extname(filePath).toLowerCase();
  return extension === '.yaml' || extension === '.yml';
};
