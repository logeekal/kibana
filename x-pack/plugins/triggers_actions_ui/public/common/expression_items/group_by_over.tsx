/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import {
  EuiExpression,
  EuiPopover,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiFieldNumber,
} from '@elastic/eui';
import { builtInGroupByTypes } from '../constants';
import { FieldOption, GroupByType } from '../types';
import { ClosablePopoverTitle } from './components';
import { IErrorObject } from '../../types';

interface GroupByOverFieldOption {
  text: string;
  value: string;
}
export interface GroupByExpressionProps {
  groupBy: string;
  errors: IErrorObject;
  onChangeSelectedTermSize: (selectedTermSize?: number) => void;
  onChangeSelectedTermField: (selectedTermField?: string) => void;
  onChangeSelectedGroupBy: (selectedGroupBy?: string) => void;
  fields: FieldOption[];
  termSize?: number;
  termField?: string;
  customGroupByTypes?: {
    [key: string]: GroupByType;
  };
  popupPosition?:
    | 'upCenter'
    | 'upLeft'
    | 'upRight'
    | 'downCenter'
    | 'downLeft'
    | 'downRight'
    | 'leftCenter'
    | 'leftUp'
    | 'leftDown'
    | 'rightCenter'
    | 'rightUp'
    | 'rightDown';
  display?: 'fullWidth' | 'inline';
}

export const GroupByExpression = ({
  groupBy,
  errors,
  onChangeSelectedTermSize,
  onChangeSelectedTermField,
  onChangeSelectedGroupBy,
  display = 'inline',
  fields,
  termSize,
  termField,
  customGroupByTypes,
  popupPosition,
}: GroupByExpressionProps) => {
  const groupByTypes = customGroupByTypes ?? builtInGroupByTypes;
  const [groupByPopoverOpen, setGroupByPopoverOpen] = useState(false);
  const MIN_TERM_SIZE = 1;
  const MAX_TERM_SIZE = 1000;
  const firstFieldOption: GroupByOverFieldOption = {
    text: i18n.translate(
      'xpack.triggersActionsUI.common.expressionItems.groupByType.timeFieldOptionLabel',
      {
        defaultMessage: 'Select a field',
      }
    ),
    value: '',
  };

  const availableFieldOptions: GroupByOverFieldOption[] = fields.reduce(
    (options: GroupByOverFieldOption[], field: FieldOption) => {
      if (groupByTypes[groupBy].validNormalizedTypes.includes(field.normalizedType)) {
        options.push({
          text: field.name,
          value: field.name,
        });
      }
      return options;
    },
    [firstFieldOption]
  );

  useEffect(() => {
    // if current field set doesn't contain selected field, clear selection
    if (
      termField &&
      termField.length > 0 &&
      fields.length > 0 &&
      !fields.find((field: FieldOption) => field.name === termField)
    ) {
      onChangeSelectedTermField('');
    }
  }, [termField, fields, onChangeSelectedTermField]);

  return (
    <EuiPopover
      button={
        <EuiExpression
          description={`${
            groupByTypes[groupBy].sizeRequired
              ? i18n.translate(
                  'xpack.triggersActionsUI.common.expressionItems.groupByType.groupedOverLabel',
                  {
                    defaultMessage: 'grouped over',
                  }
                )
              : i18n.translate(
                  'xpack.triggersActionsUI.common.expressionItems.groupByType.overLabel',
                  {
                    defaultMessage: 'over',
                  }
                )
          }`}
          data-test-subj="groupByExpression"
          value={`${groupByTypes[groupBy].text} ${
            groupByTypes[groupBy].sizeRequired
              ? `${termSize} ${termField ? `'${termField}'` : ''}`
              : ''
          }`}
          isActive={groupByPopoverOpen || (groupBy === 'top' && !(termSize && termField))}
          onClick={() => {
            setGroupByPopoverOpen(true);
          }}
          display={display === 'inline' ? 'inline' : 'columns'}
          isInvalid={!(groupBy === 'all' || (termSize && termField))}
        />
      }
      isOpen={groupByPopoverOpen}
      closePopover={() => {
        setGroupByPopoverOpen(false);
      }}
      ownFocus
      display={display === 'fullWidth' ? 'block' : 'inline-block'}
      anchorPosition={popupPosition ?? 'downRight'}
      repositionOnScroll
    >
      <div>
        <ClosablePopoverTitle onClose={() => setGroupByPopoverOpen(false)}>
          <FormattedMessage
            id="xpack.triggersActionsUI.common.expressionItems.groupByType.overButtonLabel"
            defaultMessage="over"
          />
        </ClosablePopoverTitle>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiSelect
              data-test-subj="overExpressionSelect"
              value={groupBy}
              onChange={(e) => {
                if (groupByTypes[e.target.value].sizeRequired) {
                  onChangeSelectedTermSize(MIN_TERM_SIZE);
                  onChangeSelectedTermField('');
                } else {
                  onChangeSelectedTermSize(undefined);
                  onChangeSelectedTermField(undefined);
                }
                onChangeSelectedGroupBy(e.target.value);
              }}
              options={Object.values(groupByTypes).map(({ text, value }) => {
                return {
                  text,
                  value,
                };
              })}
            />
          </EuiFlexItem>

          {groupByTypes[groupBy].sizeRequired ? (
            <>
              <EuiFlexItem grow={false}>
                <EuiFormRow isInvalid={errors.termSize.length > 0} error={errors.termSize}>
                  <EuiFieldNumber
                    css={css`
                      min-width: 50px;
                    `}
                    isInvalid={errors.termSize.length > 0}
                    value={termSize || ''}
                    onChange={(e) => {
                      const { value } = e.target;
                      const termSizeVal = value !== '' ? parseFloat(value) : undefined;
                      onChangeSelectedTermSize(termSizeVal);
                    }}
                    min={MIN_TERM_SIZE}
                    max={MAX_TERM_SIZE}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFormRow
                  isInvalid={errors.termField.length > 0 && termField !== undefined}
                  error={errors.termField}
                >
                  <EuiSelect
                    data-test-subj="fieldsExpressionSelect"
                    value={termField}
                    isInvalid={errors.termField.length > 0 && termField !== undefined}
                    onChange={(e) => {
                      onChangeSelectedTermField(e.target.value);
                    }}
                    options={availableFieldOptions}
                    onBlur={() => {
                      if (termField === undefined) {
                        onChangeSelectedTermField('');
                      }
                    }}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </>
          ) : null}
        </EuiFlexGroup>
      </div>
    </EuiPopover>
  );
};

// eslint-disable-next-line import/no-default-export
export { GroupByExpression as default };
