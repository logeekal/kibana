/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';

import { EuiContextMenuItem } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { ALERT_RULE_EXCEPTIONS_LIST } from '@kbn/rule-data-utils';
import type { ExceptionListId } from '@kbn/securitysolution-io-ts-list-types';
import { useApi } from '@kbn/securitysolution-list-hooks';

import type { Filter } from '@kbn/es-query';
import { timelineDefaults } from '../../../../timelines/store/timeline/defaults';
import { useKibana } from '../../../../common/lib/kibana';
import { TimelineId, TimelineType } from '../../../../../common/types/timeline';
import type { Ecs } from '../../../../../common/ecs';
import { timelineActions, timelineSelectors } from '../../../../timelines/store/timeline';
import { sendAlertToTimelineAction } from '../actions';
import { dispatchUpdateTimeline } from '../../../../timelines/components/open_timeline/helpers';
import { useCreateTimeline } from '../../../../timelines/components/timeline/properties/use_create_timeline';
import type { CreateTimelineProps } from '../types';
import { ACTION_INVESTIGATE_IN_TIMELINE } from '../translations';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { getField } from '../../../../helpers';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import { useStartTransaction } from '../../../../common/lib/apm/use_start_transaction';
import { ALERTS_ACTIONS } from '../../../../common/lib/apm/user_actions';

interface UseInvestigateInTimelineActionProps {
  ecsRowData?: Ecs | null;
  onInvestigateInTimelineAlertClick?: () => void;
}

export const useInvestigateInTimeline = ({
  ecsRowData,
  onInvestigateInTimelineAlertClick,
}: UseInvestigateInTimelineActionProps) => {
  const { addError } = useAppToasts();
  const {
    data: { search: searchStrategyClient, query },
  } = useKibana().services;
  const dispatch = useDispatch();
  const { startTransaction } = useStartTransaction();

  const { services } = useKibana();
  const { getExceptionFilterFromIds } = useApi(services.http);

  const getExceptionFilter = useCallback(
    async (ecsData: Ecs): Promise<Filter | undefined> => {
      const exceptionsLists = (getField(ecsData, ALERT_RULE_EXCEPTIONS_LIST) ?? []).reduce(
        (acc: ExceptionListId[], next: string) => {
          const parsedList = JSON.parse(next);
          if (parsedList.type === 'detection') {
            const formattedList = {
              exception_list_id: parsedList.list_id,
              namespace_type: parsedList.namespace_type,
            };
            acc.push(formattedList);
          }
          return acc;
        },
        []
      );

      if (exceptionsLists.length > 0) {
        await getExceptionFilterFromIds({
          exceptionListIds: exceptionsLists,
          excludeExceptions: true,
          chunkSize: 20,
          alias: 'Exceptions',
          onSuccess: (filter) => {
            return filter;
          },
          onError: (err: string[]) => {
            addError(err, {
              title: i18n.translate(
                'xpack.securitySolution.detectionEngine.alerts.fetchExceptionFilterFailure',
                { defaultMessage: 'Error fetching exception filter.' }
              ),
            });
          },
        });
      }
      return undefined;
    },
    [addError, getExceptionFilterFromIds]
  );

  const filterManagerBackup = useMemo(() => query.filterManager, [query.filterManager]);
  const getManageTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);
  const { filterManager: activeFilterManager } = useDeepEqualSelector(
    (state) => getManageTimeline(state, TimelineId.active ?? '') ?? timelineDefaults
  );
  const filterManager = useMemo(
    () => activeFilterManager ?? filterManagerBackup,
    [activeFilterManager, filterManagerBackup]
  );

  const updateTimelineIsLoading = useCallback(
    (payload) => dispatch(timelineActions.updateIsLoading(payload)),
    [dispatch]
  );

  const clearActiveTimeline = useCreateTimeline({
    timelineId: TimelineId.active,
    timelineType: TimelineType.default,
  });

  const createTimeline = useCallback(
    ({ from: fromTimeline, timeline, to: toTimeline, ruleNote }: CreateTimelineProps) => {
      clearActiveTimeline();
      updateTimelineIsLoading({ id: TimelineId.active, isLoading: false });
      dispatchUpdateTimeline(dispatch)({
        duplicate: true,
        from: fromTimeline,
        id: TimelineId.active,
        notes: [],
        timeline: {
          ...timeline,
          filterManager,
          indexNames: timeline.indexNames ?? [],
          show: true,
        },
        to: toTimeline,
        ruleNote,
      })();
    },
    [dispatch, filterManager, updateTimelineIsLoading, clearActiveTimeline]
  );

  const investigateInTimelineAlertClick = useCallback(async () => {
    startTransaction({ name: ALERTS_ACTIONS.INVESTIGATE_IN_TIMELINE });
    if (onInvestigateInTimelineAlertClick) {
      onInvestigateInTimelineAlertClick();
    }
    if (ecsRowData != null) {
      await sendAlertToTimelineAction({
        createTimeline,
        ecsData: ecsRowData,
        searchStrategyClient,
        updateTimelineIsLoading,
        getExceptionFilter,
      });
    }
  }, [
    startTransaction,
    createTimeline,
    ecsRowData,
    onInvestigateInTimelineAlertClick,
    searchStrategyClient,
    updateTimelineIsLoading,
    getExceptionFilter,
  ]);

  const investigateInTimelineActionItems = useMemo(
    () => [
      <EuiContextMenuItem
        key="investigate-in-timeline-action-item"
        data-test-subj="investigate-in-timeline-action-item"
        disabled={ecsRowData == null}
        onClick={investigateInTimelineAlertClick}
      >
        {ACTION_INVESTIGATE_IN_TIMELINE}
      </EuiContextMenuItem>,
    ],
    [ecsRowData, investigateInTimelineAlertClick]
  );

  return {
    investigateInTimelineActionItems,
    investigateInTimelineAlertClick,
  };
};
