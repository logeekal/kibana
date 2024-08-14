/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { FormProvider, useForm } from 'react-hook-form';
import { MonitorFilters } from '../monitors_overview/types';
import { MonitorFiltersForm } from './monitor_filters_form';

interface MonitorConfigurationProps {
  initialInput?: {
    filters: MonitorFilters;
  };
  onCreate: (props: { filters: MonitorFilters }) => void;
  onCancel: () => void;
}

export function MonitorConfiguration({
  initialInput,
  onCreate,
  onCancel,
}: MonitorConfigurationProps) {
  const methods = useForm<MonitorFilters>({
    defaultValues: {
      monitorIds: [],
      projects: [],
      tags: [],
      monitorTypes: [],
      locations: [],
    },
    values: initialInput?.filters,
    mode: 'all',
  });
  const { getValues, formState } = methods;

  const onConfirmClick = () => {
    const newFilters = getValues();
    onCreate({
      filters: newFilters,
    });
  };

  return (
    <EuiFlyout data-test-subj="sloSingleOverviewConfiguration" onClose={onCancel}>
      <EuiFlyoutHeader>
        <EuiFlexGroup direction="column">
          <EuiFlexItem>
            <EuiTitle>
              <h2>
                {i18n.translate(
                  'xpack.synthetics.overviewEmbeddable.config.sloSelector.headerTitle',
                  {
                    defaultMessage: 'Overview configuration',
                  }
                )}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <>
        <EuiFlyoutBody>
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiFlexGroup>
                <EuiFlexItem data-test-subj="singleSloSelector" grow>
                  <FormProvider {...methods}>
                    <MonitorFiltersForm />
                  </FormProvider>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutBody>
        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiButtonEmpty
              data-test-subj="syntheticsMonitorConfigurationCancelButton"
              onClick={onCancel}
            >
              <FormattedMessage
                id="xpack.synthetics.sloEmbeddable.config.cancelButtonLabel"
                defaultMessage="Cancel"
              />
            </EuiButtonEmpty>

            <EuiButton
              data-test-subj="syntheticsMonitorConfigurationSaveButton"
              isDisabled={!(formState.isDirty || !initialInput)}
              onClick={onConfirmClick}
              fill
            >
              <FormattedMessage
                id="xpack.synthetics.overviewEmbeddableSlo.config.confirmButtonLabel"
                defaultMessage="Save"
              />
            </EuiButton>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </>
    </EuiFlyout>
  );
}
