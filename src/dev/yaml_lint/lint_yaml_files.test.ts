/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import Path from 'path';

import { lintYamlFiles } from './lint_yaml_files';

describe('lintYamlFiles', () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(Path.join(os.tmpdir(), 'kibana-yaml-lint-'));
  });

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const createYamlFile = async (name: string, contents: string): Promise<string> => {
    const filePath = Path.join(tempDirectory, name);
    await writeFile(filePath, contents);
    return filePath;
  };

  it('aggregates syntax errors without writing invalid YAML', async () => {
    const filePath = await createYamlFile(
      'invalid.yaml',
      'message: "first line:\n- invalid continuation"\n'
    );

    const result = await lintYamlFiles([filePath], { fix: true });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'syntax',
        }),
      ])
    );
    await expect(readFile(filePath, 'utf8')).resolves.toBe(
      'message: "first line:\n- invalid continuation"\n'
    );
  });

  it('reports formatting differences without modifying files by default', async () => {
    const filePath = await createYamlFile('dirty.yml', 'foo:    bar\n');

    const result = await lintYamlFiles([filePath]);

    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: 'style',
      }),
    ]);
    expect(result.fixedFiles).toEqual([]);
    await expect(readFile(filePath, 'utf8')).resolves.toBe('foo:    bar\n');
  });

  it('formats valid YAML only when fix is explicit', async () => {
    const filePath = await createYamlFile('dirty.yml', 'foo:    bar\r\n');

    const result = await lintYamlFiles([filePath], { fix: true });

    expect(result.errors).toEqual([]);
    expect(result.fixedFiles).toHaveLength(1);
    await expect(readFile(filePath, 'utf8')).resolves.toBe('foo: bar\n');

    const secondResult = await lintYamlFiles([filePath], { fix: true });
    expect(secondResult.fixedFiles).toEqual([]);
  });

  it('can check syntax without checking formatting', async () => {
    const filePath = await createYamlFile('dirty.yml', 'foo:    bar\n');

    const result = await lintYamlFiles([filePath], { checkStyle: false });

    expect(result.errors).toEqual([]);
  });

  it('ignores deleted changed-file paths', async () => {
    const result = await lintYamlFiles([Path.join(tempDirectory, 'deleted.yml')]);

    expect(result.checkedFiles).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
