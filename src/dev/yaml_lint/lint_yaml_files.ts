/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFile, writeFile } from 'fs/promises';
import Path from 'path';

import { REPO_ROOT } from '@kbn/repo-info';
import prettier, { type Options as PrettierOptions } from 'prettier';
import { parseAllDocuments } from 'yaml';

import { getYamlLintExclusion, isYamlFile } from './yaml_lint_policy';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export type YamlLintErrorKind = 'read' | 'syntax' | 'style' | 'size';

export interface YamlLintError {
  readonly filePath: string;
  readonly kind: YamlLintErrorKind;
  readonly message: string;
}

export interface YamlLintWarning {
  readonly filePath: string;
  readonly message: string;
}

export interface LintYamlFilesOptions {
  readonly checkStyle?: boolean;
  readonly fix?: boolean;
}

export interface LintYamlFilesResult {
  readonly checkedFiles: string[];
  readonly excludedFiles: string[];
  readonly fixedFiles: string[];
  readonly errors: YamlLintError[];
  readonly warnings: YamlLintWarning[];
}

interface ParsedYamlFile {
  readonly absolutePath: string;
  readonly filePath: string;
  readonly source: string;
}

const prettierConfigCache = new Map<string, Promise<PrettierOptions | null>>();

const normalizeRepoRelativePath = (filePath: string): string => {
  const absolutePath = Path.resolve(REPO_ROOT, filePath);
  return Path.relative(REPO_ROOT, absolutePath).split(Path.sep).join('/');
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

const resolvePrettierConfig = (absolutePath: string): Promise<PrettierOptions | null> => {
  const directory = Path.dirname(absolutePath);
  const cachedConfig = prettierConfigCache.get(directory);
  if (cachedConfig) {
    return cachedConfig;
  }

  const config = prettier.resolveConfig(absolutePath, { editorconfig: true });
  prettierConfigCache.set(directory, config);
  return config;
};

const parseYaml = (
  filePath: string,
  source: string
): { errors: YamlLintError[]; warnings: YamlLintWarning[] } => {
  const documents = parseAllDocuments(source);
  return {
    errors: documents.flatMap((document) =>
      document.errors.map((error) => ({
        filePath,
        kind: 'syntax' as const,
        message: error.message,
      }))
    ),
    warnings: documents.flatMap((document) =>
      document.warnings.map((warning) => ({
        filePath,
        message: warning.message,
      }))
    ),
  };
};

/**
 * Checks repository-relative YAML paths with one shared syntax and formatting
 * policy. Generated files are removed before reading, and fixes are only
 * written after both the original and formatted YAML parse successfully.
 */
export const lintYamlFiles = async (
  candidatePaths: readonly string[],
  { checkStyle = true, fix = false }: LintYamlFilesOptions = {}
): Promise<LintYamlFilesResult> => {
  const checkedFiles: string[] = [];
  const excludedFiles: string[] = [];
  const fixedFiles: string[] = [];
  const errors: YamlLintError[] = [];
  const warnings: YamlLintWarning[] = [];
  const parsedFiles: ParsedYamlFile[] = [];

  const filePaths = [...new Set(candidatePaths.map(normalizeRepoRelativePath))]
    .filter(isYamlFile)
    .sort();

  for (const filePath of filePaths) {
    if (getYamlLintExclusion(filePath)) {
      excludedFiles.push(filePath);
      continue;
    }

    const absolutePath = Path.resolve(REPO_ROOT, filePath);
    try {
      const source = await readFile(absolutePath, 'utf8');
      checkedFiles.push(filePath);

      if (Buffer.byteLength(source) > MAX_FILE_SIZE_BYTES) {
        errors.push({
          filePath,
          kind: 'size',
          message: `File exceeds the 2 MiB YAML lint limit. If it is generated, add a narrowly scoped policy exclusion with its generator rationale.`,
        });
        continue;
      }

      const parseResult = parseYaml(filePath, source);
      errors.push(...parseResult.errors);
      warnings.push(...parseResult.warnings);
      if (parseResult.errors.length === 0) {
        parsedFiles.push({ absolutePath, filePath, source });
      }
    } catch (error) {
      // Changed-file providers can include deleted paths. They are not lint
      // targets and should disappear without turning the run into a read error.
      if (isMissingFileError(error)) {
        continue;
      }
      errors.push({
        filePath,
        kind: 'read',
        message: getErrorMessage(error),
      });
    }
  }

  if (!checkStyle) {
    return { checkedFiles, excludedFiles, fixedFiles, errors, warnings };
  }

  for (const { absolutePath, filePath, source } of parsedFiles) {
    try {
      const config = await resolvePrettierConfig(absolutePath);
      const formatted = prettier.format(source, {
        ...config,
        filepath: absolutePath,
        endOfLine: 'lf',
      });

      if (formatted === source) {
        continue;
      }

      const formattedParseResult = parseYaml(filePath, formatted);
      if (formattedParseResult.errors.length > 0) {
        errors.push({
          filePath,
          kind: 'style',
          message: `Prettier produced invalid YAML:\n${formattedParseResult.errors
            .map(({ message }) => message)
            .join('\n')}`,
        });
        continue;
      }

      if (!fix) {
        errors.push({
          filePath,
          kind: 'style',
          message: 'File is not formatted. Run `node scripts/yaml_lint <path> --fix`.',
        });
        continue;
      }

      await writeFile(absolutePath, formatted, 'utf8');
      fixedFiles.push(filePath);
    } catch (error) {
      errors.push({
        filePath,
        kind: 'style',
        message: getErrorMessage(error),
      });
    }
  }

  return { checkedFiles, excludedFiles, fixedFiles, errors, warnings };
};

export const formatYamlLintErrors = (errors: readonly YamlLintError[]): string =>
  errors.map(({ filePath, message }) => `${filePath}:\n${message}`).join('\n\n');
