#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

.buildkite/scripts/bootstrap.sh

# Run every linter before failing so one problem does not hide another.
set +e

echo '--- Lint: stylelint'
node scripts/stylelint
stylelint_exit=$?
if [[ "${stylelint_exit}" == "0" ]]; then
  echo "stylelint ✅"
fi

echo '--- Lint: yaml'
node scripts/yaml_lint --profile pr --no-fix
yaml_exit=$?
if [[ "${yaml_exit}" == "0" ]]; then
  echo "yaml ✅"
fi

echo '--- Lint: eslint'
# disable "Exit immediately" mode so that we can run eslint, capture it's exit code, and respond appropriately
# after possibly commiting fixed files to the repo
if is_pr && ! is_auto_commit_disabled; then
  desc="node scripts/eslint_all_files --no-cache --fix"
  node scripts/eslint_all_files --no-cache --fix
else
  desc="node scripts/eslint_all_files --no-cache"
  node scripts/eslint_all_files --no-cache
fi

eslint_exit=$?
# re-enable "Exit immediately" mode
set -e

check_for_changed_files "$desc" true

if [[ "${stylelint_exit}" != "0" || "${yaml_exit}" != "0" || "${eslint_exit}" != "0" ]]; then
  exit 1
fi

echo "eslint ✅"
