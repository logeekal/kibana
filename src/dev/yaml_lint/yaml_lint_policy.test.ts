/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getYamlLintExclusion, isYamlFile } from './yaml_lint_policy';

describe('YAML lint policy', () => {
  it.each([
    'oas_docs/output/kibana.yaml',
    'src/platform/packages/shared/example/moon.yml',
    '.github/workflows/reviewer.lock.yml',
    'docs/changelog/123.yaml',
    '.buildkite/pipeline-resource-definitions/locations.yml',
    'x-pack/plugin/docs/openapi/example.bundled.schema.yaml',
  ])('excludes generated YAML: %s', (filePath) => {
    expect(getYamlLintExclusion(filePath)).toBeDefined();
  });

  it.each([
    'config/kibana.yml',
    'oas_docs/examples/request.yaml',
    'x-pack/plugin/docs/openapi/source.schema.yaml',
  ])('keeps hand-authored YAML in scope: %s', (filePath) => {
    expect(getYamlLintExclusion(filePath)).toBeUndefined();
  });

  it('recognizes YAML extensions case-insensitively', () => {
    expect(isYamlFile('example.YAML')).toBe(true);
    expect(isYamlFile('example.json')).toBe(false);
  });
});
