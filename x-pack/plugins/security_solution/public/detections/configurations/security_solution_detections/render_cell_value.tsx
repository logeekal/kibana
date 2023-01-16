/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiDataGridCellValueElementProps } from '@elastic/eui';
import { EuiIcon, EuiToolTip, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import type { GetRenderCellValue } from '@kbn/triggers-actions-ui-plugin/public';
import { GuidedOnboardingTourStep } from '../../../common/components/guided_onboarding_tour/tour_step';
import { isDetectionsAlertsTable } from '../../../common/components/top_n/helpers';
import {
  AlertsCasesTourSteps,
  SecurityStepId,
} from '../../../common/components/guided_onboarding_tour/tour_config';
import { SIGNAL_RULE_NAME_FIELD_NAME } from '../../../timelines/components/timeline/body/renderers/constants';
import { useSourcererDataView } from '../../../common/containers/sourcerer';
import { SourcererScopeName } from '../../../common/store/sourcerer/model';

import type { CellValueElementProps } from '../../../timelines/components/timeline/cell_rendering';
import { DefaultCellRenderer } from '../../../timelines/components/timeline/cell_rendering/default_cell_renderer';

import { SUPPRESSED_ALERT_TOOLTIP } from './translations';

/**
 * This implementation of `EuiDataGrid`'s `renderCellValue`
 * accepts `EuiDataGridCellValueElementProps`, plus `data`
 * from the TGrid
 */
export const RenderCellValue: React.FC<EuiDataGridCellValueElementProps & CellValueElementProps> = (
  props
) => {
  const { columnId, rowIndex, scopeId } = props;
  const isTourAnchor = useMemo(
    () =>
      columnId === SIGNAL_RULE_NAME_FIELD_NAME &&
      isDetectionsAlertsTable(scopeId) &&
      rowIndex === 0 &&
      !props.isDetails,
    [columnId, props.isDetails, rowIndex, scopeId]
  );

  const suppressionCount = props.ecsData?.kibana?.alert.suppression?.docs_count;

  const component = (
    <GuidedOnboardingTourStep
      isTourAnchor={isTourAnchor}
      step={AlertsCasesTourSteps.pointToAlertName}
      tourId={SecurityStepId.alertsCases}
    >
      <DefaultCellRenderer {...props} />
    </GuidedOnboardingTourStep>
  );

  return columnId === SIGNAL_RULE_NAME_FIELD_NAME &&
    suppressionCount &&
    parseInt(suppressionCount[0], 10) > 0 ? (
    <EuiFlexGroup gutterSize="xs">
      <EuiFlexItem grow={false}>
        <EuiToolTip
          position="top"
          content={SUPPRESSED_ALERT_TOOLTIP(parseInt(suppressionCount[0], 10))}
        >
          <EuiIcon type="layers" />
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{component}</EuiFlexItem>
    </EuiFlexGroup>
  ) : (
    component
  );
};

export const getRenderCellValueHook = ({ scopeId }: { scopeId: string }) => {
  const useRenderCellValue: GetRenderCellValue = ({ setFlyoutAlert }) => {
    const { browserFields } = useSourcererDataView(SourcererScopeName.detections);

    const result = useCallback(
      ({
        columnId,
        colIndex,
        data,
        ecsData,
        eventId,
        globalFilters,
        header,
        isDetails = false,
        isDraggable = false,
        isExpandable,
        isExpanded,
        linkValues,
        rowIndex,
        rowRenderers,
        setCellProps,
        truncate = true,
      }: CellValueElementProps) => {
        const splitColumnId = columnId.split('.');
        let myHeader = header ?? { id: columnId };

        if (splitColumnId.length > 1 && browserFields[splitColumnId[0]]) {
          const attr = (browserFields[splitColumnId[0]].fields ?? {})[columnId] ?? {};
          myHeader = { ...myHeader, ...attr };
        } else if (splitColumnId.length === 1) {
          const attr = (browserFields.base.fields ?? {})[columnId] ?? {};
          myHeader = { ...myHeader, ...attr };
        }
        return (
          <DefaultCellRenderer
            browserFields={browserFields}
            columnId={columnId}
            data={data}
            ecsData={ecsData}
            eventId={eventId}
            globalFilters={globalFilters}
            header={myHeader}
            isDetails={isDetails}
            isDraggable={isDraggable}
            isExpandable={isExpandable}
            isExpanded={isExpanded}
            linkValues={linkValues}
            rowIndex={rowIndex}
            colIndex={colIndex}
            rowRenderers={rowRenderers}
            setCellProps={setCellProps}
            scopeId={scopeId}
            truncate={truncate}
          />
        );
      },
      [browserFields]
    );

    return result;
  };

  return useRenderCellValue;
};
