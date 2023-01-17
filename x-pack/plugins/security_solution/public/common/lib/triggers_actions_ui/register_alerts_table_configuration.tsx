/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { AlertsTableConfigurationRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';

import type {
  EuiDataGridColumn,
  EuiDataGridColumnCellAction,
  EuiDataGridRefProps,
} from '@elastic/eui';
import { get, isEmpty, isEqual } from 'lodash';
import type { AlertsTableConfigurationRegistry } from '@kbn/triggers-actions-ui-plugin/public/types';
import { useDispatch, useSelector } from 'react-redux';
import type { Filter } from '@kbn/es-query';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/typesWithBodyKey';
import type { SerializableRecord } from '@kbn/utility-types';
import { useAlertTableFilters } from '../../../detections/pages/detection_engine/use_alert_table_filters';
import { AdditionalFiltersAction } from '../../../detections/components/alerts_table/additional_filters_action';
import { useUserData } from '../../../detections/components/user_info';
import { getAlertsDefaultModel } from '../../../detections/components/alerts_table/default_config';
import { getDefaultControlColumn } from '../../../timelines/components/timeline/body/control_columns';
import { useBulkAddToCaseActions } from '../../../detections/components/alerts_table/timeline_actions/use_bulk_add_to_case_actions';
import { useAddBulkToTimelineAction } from '../../../detections/components/alerts_table/timeline_actions/use_add_bulk_to_timeline';
import { APP_ID, CASES_FEATURE_ID } from '../../../../common/constants';
import { getDataTablesInStorageByIds } from '../../../timelines/containers/local_storage';
import { TableId, TimelineId } from '../../../../common/types';
import type {
  ColumnHeaderOptions,
  SetEventsDeleted,
  SetEventsLoading,
} from '../../../../common/types';
import { getColumns } from '../../../detections/configurations/security_solution_detections';
import { getRenderCellValueHook } from '../../../detections/configurations/security_solution_detections/render_cell_value';
import { useToGetInternalFlyout } from '../../../timelines/components/side_panel/event_details/flyout';
import type { TimelineItem, TimelineNonEcsData } from '../../../../common/search_strategy';
import type { Ecs } from '../../../../common/ecs';
import { useSourcererDataView } from '../../containers/sourcerer';
import { SourcererScopeName } from '../../store/sourcerer/model';
import { defaultCellActions } from '../cell_actions/default_cell_actions';
import { useGlobalTime } from '../../containers/use_global_time';
import { useLicense } from '../../hooks/use_license';
import { RowAction } from '../../components/control_columns/row_action';
import type { State } from '../../store';
import { eventsViewerSelector } from '../../components/events_viewer/selectors';
import { defaultHeaders } from '../../store/data_table/defaults';
import { dataTableActions } from '../../store/data_table';
import type { OnRowSelected } from '../../components/data_table/types';
import { getEventIdToDataMapping } from '../../components/data_table/helpers';
import { checkBoxControlColumn } from '../../components/control_columns';
import { useBulkAlertActionItems } from './use_alert_actions';
import { FIELDS_WITHOUT_CELL_ACTIONS } from '../cell_actions/constants';
import { alertTableViewModeSelector } from '../../store/alert_table/selectors';
import { useShallowEqualSelector } from '../../hooks/use_selector';
import type { ViewSelection } from '../../components/events_viewer/summary_view_select';
import {
  ALERTS_TABLE_VIEW_SELECTION_KEY,
  VIEW_SELECTION,
} from '../../components/events_viewer/summary_view_select';
import { changeAlertTableViewMode } from '../../store/alert_table/actions';
import { RightTopMenu } from '../../components/events_viewer/right_top_menu';

function getFiltersForDSLQuery(datafeedQuery: QueryDslQueryContainer): Filter[] {
  if (isKnownEmptyQuery(datafeedQuery)) {
    return [];
  }

  return [
    {
      meta: {
        negate: false,
        disabled: false,
        type: 'custom',
        value: JSON.stringify(datafeedQuery),
      },
      query: datafeedQuery as SerializableRecord,
    },
  ];
}

// check to see if the query is a known "empty" shape
export function isKnownEmptyQuery(query: QueryDslQueryContainer) {
  const queries = [
    // the default query used by the job wizards
    { bool: { must: [{ match_all: {} }] } },
    // the default query used created by lens created jobs
    { bool: { filter: [], must: [{ match_all: {} }], must_not: [] } },
    // variations on the two previous queries
    { bool: { filter: [], must: [{ match_all: {} }] } },
    { bool: { must: [{ match_all: {} }], must_not: [] } },
    // the query generated by QA Framework created jobs
    { match_all: {} },
  ];
  if (queries.some((q) => isEqual(q, query))) {
    return true;
  }

  return false;
}

const registerAlertsTableConfiguration = (
  registry: AlertsTableConfigurationRegistryContract,
  storage: Storage
) => {
  if (registry.has(APP_ID)) {
    return;
  }
  const dataTableStorage = getDataTablesInStorageByIds(storage, [TableId.alertsOnAlertsPage]);
  const columnsFormStorage = dataTableStorage?.[TableId.alertsOnAlertsPage]?.columns ?? [];
  const alertColumns = columnsFormStorage.length ? columnsFormStorage : getColumns();

  const useBulkActionHook: AlertsTableConfigurationRegistry['useBulkActions'] = (query) => {
    const { from, to } = useGlobalTime();
    const filters = getFiltersForDSLQuery(query);

    const timelineAction = useAddBulkToTimelineAction({
      localFilters: filters,
      from,
      to,
      scopeId: SourcererScopeName.detections,
      tableId: TableId.alertsOnAlertsPage,
    });

    const alertActions = useBulkAlertActionItems({ scopeId: SourcererScopeName.detections });

    const caseActions = useBulkAddToCaseActions();
    return [...alertActions, ...caseActions, timelineAction];
  };

  const useActionsColumn: AlertsTableConfigurationRegistry['useActionsColumn'] = (
    ecsData,
    oldAlertsData
  ) => {
    const license = useLicense();
    const dispatch = useDispatch();
    const isEnterprisePlus = license.isEnterprise();
    const ACTION_BUTTON_COUNT = isEnterprisePlus ? 5 : 4;

    const timelineItems: TimelineItem[] = (ecsData as Ecs[]).map((ecsItem, index) => ({
      _id: ecsItem._id,
      _index: ecsItem._index,
      ecs: ecsItem,
      data: oldAlertsData ? oldAlertsData[index] : [],
    }));

    const withCheckboxLeadingColumns = [
      checkBoxControlColumn,
      ...getDefaultControlColumn(ACTION_BUTTON_COUNT),
    ];

    const leadingControlColumns = useMemo(
      () => [...getDefaultControlColumn(ACTION_BUTTON_COUNT)],
      [ACTION_BUTTON_COUNT]
    );

    const {
      setEventsDeleted: setEventsDeletedAction,
      setEventsLoading: setEventsLoadingAction,
      setSelected,
    } = dataTableActions;

    const {
      dataTable: {
        columns,
        deletedEventIds,
        showCheckboxes,
        queryFields,
        selectedEventIds,
        loadingEventIds,
      } = getAlertsDefaultModel(license),
    } = useSelector((state: State) => eventsViewerSelector(state, TableId.alertsOnAlertsPage));

    const setEventsLoading = useCallback<SetEventsLoading>(
      ({ eventIds, isLoading }) => {
        dispatch(setEventsLoadingAction({ id: TableId.alertsOnAlertsPage, eventIds, isLoading }));
      },
      [dispatch, setEventsLoadingAction]
    );

    const setEventsDeleted = useCallback<SetEventsDeleted>(
      ({ eventIds, isDeleted }) => {
        dispatch(setEventsDeletedAction({ id: TableId.alertsOnAlertsPage, eventIds, isDeleted }));
      },
      [dispatch, setEventsDeletedAction]
    );

    const nonDeletedEvents = useMemo(
      () => timelineItems.filter((e) => !deletedEventIds.includes(e._id)),
      [deletedEventIds, timelineItems]
    );

    const [{ hasIndexWrite = false, hasIndexMaintenance = false }] = useUserData();

    const hasCrudPermissions = useMemo(
      () => hasIndexWrite && hasIndexMaintenance,
      [hasIndexMaintenance, hasIndexWrite]
    );

    const selectedCount = useMemo(() => Object.keys(selectedEventIds).length, [selectedEventIds]);

    const onRowSelected: OnRowSelected = useCallback(
      ({ eventIds, isSelected }: { eventIds: string[]; isSelected: boolean }) => {
        setSelected({
          id: TableId.alertsOnAlertsPage,
          eventIds: getEventIdToDataMapping(
            nonDeletedEvents,
            eventIds,
            queryFields,
            hasCrudPermissions as boolean
          ),
          isSelected,
          isSelectAllChecked: isSelected && selectedCount + 1 === nonDeletedEvents.length,
        });
      },
      [setSelected, nonDeletedEvents, queryFields, hasCrudPermissions, selectedCount]
    );

    const columnHeaders = isEmpty(columns) ? defaultHeaders : columns;

    return {
      renderCustomActionsRow: ({ rowIndex, cveProps }) => {
        return (
          <RowAction
            columnId={`actions-${rowIndex}`}
            columnHeaders={columnHeaders}
            controlColumn={leadingControlColumns[0]}
            data={timelineItems[rowIndex]}
            disabled={false}
            index={rowIndex}
            isDetails={cveProps.isDetails}
            isExpanded={cveProps.isExpanded}
            isEventViewer={false}
            isExpandable={cveProps.isExpandable}
            loadingEventIds={loadingEventIds}
            onRowSelected={onRowSelected}
            rowIndex={cveProps.rowIndex}
            colIndex={cveProps.colIndex}
            pageRowIndex={rowIndex}
            selectedEventIds={selectedEventIds}
            setCellProps={cveProps.setCellProps}
            showCheckboxes={showCheckboxes}
            tabType={'query'}
            tableId={TableId.alertsOnAlertsPage}
            width={0}
            setEventsLoading={setEventsLoading}
            setEventsDeleted={setEventsDeleted}
          />
        );
      },
      width: 124,
    };
  };

  const useInternalFlyout = () => {
    const { header, body, footer } = useToGetInternalFlyout();
    return { header, body, footer };
  };

  const useCellActions = ({
    columns,
    data,
    ecsData,
    dataGridRef,
    pageSize,
  }: {
    // Hover Actions
    columns: EuiDataGridColumn[];
    data: unknown[][];
    ecsData: unknown[];
    dataGridRef?: EuiDataGridRefProps;
    pageSize: number;
  }) => {
    const { browserFields } = useSourcererDataView(SourcererScopeName.detections);
    const viewModeSelector = alertTableViewModeSelector();
    const viewMode = useShallowEqualSelector((state) => viewModeSelector(state));

    if (viewMode === VIEW_SELECTION.eventRenderedView) {
      return { cellActions: [] };
    }

    return {
      cellActions: defaultCellActions.map((dca) => {
        return dca({
          browserFields,
          data: data as TimelineNonEcsData[][],
          ecsData: ecsData as Ecs[],
          header: columns.map((col) => {
            const splitCol = col.id.split('.');
            const fields =
              splitCol.length > 0
                ? get(browserFields, [
                    splitCol.length === 1 ? 'base' : splitCol[0],
                    'fields',
                    col.id,
                  ])
                : {};
            return {
              ...col,
              ...fields,
            };
          }) as ColumnHeaderOptions[],
          scopeId: SourcererScopeName.default,
          pageSize,
          closeCellPopover: dataGridRef?.closeCellPopover,
        });
      }) as EuiDataGridColumnCellAction[],
      visibleCellActions: 5,
      disabledCellActions: FIELDS_WITHOUT_CELL_ACTIONS,
    };
  };

  const usePersistentControls = () => {
    const dispatch = useDispatch();

    const getViewMode = alertTableViewModeSelector();

    const storedTableView = storage.get(ALERTS_TABLE_VIEW_SELECTION_KEY);

    const stateTableView = useShallowEqualSelector((state) => getViewMode(state));

    const tableView = storedTableView ?? stateTableView;

    const handleChangeTableView = useCallback(
      (selectedView: ViewSelection) => {
        dispatch(
          changeAlertTableViewMode({
            viewMode: selectedView,
          })
        );
      },
      [dispatch]
    );

    const {
      showBuildingBlockAlerts,
      setShowBuildingBlockAlerts,
      showOnlyThreatIndicatorAlerts,
      setShowOnlyThreatIndicatorAlerts,
    } = useAlertTableFilters();

    const additionalFiltersComponent = useMemo(
      () => (
        <AdditionalFiltersAction
          areEventsLoading={false}
          onShowBuildingBlockAlertsChanged={setShowBuildingBlockAlerts}
          showBuildingBlockAlerts={showBuildingBlockAlerts}
          onShowOnlyThreatIndicatorAlertsChanged={setShowOnlyThreatIndicatorAlerts}
          showOnlyThreatIndicatorAlerts={showOnlyThreatIndicatorAlerts}
        />
      ),
      [
        showBuildingBlockAlerts,
        setShowBuildingBlockAlerts,
        showOnlyThreatIndicatorAlerts,
        setShowOnlyThreatIndicatorAlerts,
      ]
    );

    return {
      right: (
        <RightTopMenu
          tableView={tableView}
          loading={false}
          tableId={TableId.alertsOnAlertsPage}
          title={'Some Title'}
          onViewChange={handleChangeTableView}
          hasRightOffset={false}
          additionalFilters={additionalFiltersComponent}
        />
      ),
    };
  };

  const renderCellValueHookAlertPage = getRenderCellValueHook({
    scopeId: SourcererScopeName.default,
  });

  const renderCellValueHookCasePage = getRenderCellValueHook({
    scopeId: TimelineId.casePage,
  });

  // regitser Alert Table on Alert Page
  registry.register({
    id: `${APP_ID}`,
    casesFeatureId: CASES_FEATURE_ID,
    columns: alertColumns,
    getRenderCellValue: renderCellValueHookAlertPage,
    useActionsColumn,
    useInternalFlyout,
    useBulkActions: useBulkActionHook,
    useCellActions,
    usePersistentControls,
  });

  registry.register({
    id: `${APP_ID}-case`,
    casesFeatureId: CASES_FEATURE_ID,
    columns: alertColumns,
    getRenderCellValue: renderCellValueHookCasePage,
    useActionsColumn,
    useInternalFlyout,
    useBulkActions: useBulkActionHook,
    useCellActions,
    usePersistentControls,
  });
};

export { registerAlertsTableConfiguration };
