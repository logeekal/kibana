/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Filter } from '@kbn/es-query';
import type {
  ControlInputTransform,
  ControlPanelState,
  OptionsListEmbeddableInput,
} from '@kbn/controls-plugin/common';
import { OPTIONS_LIST_CONTROL } from '@kbn/controls-plugin/common';
import type {
  ControlGroupInput,
  ControlGroupInputBuilder,
  ControlGroupOutput,
  ControlGroupContainer,
  ControlGroupRendererProps,
} from '@kbn/controls-plugin/public';
import { ControlGroupRenderer } from '@kbn/controls-plugin/public';
import type { PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { ViewMode } from '@kbn/embeddable-plugin/public';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import type { Subscription } from 'rxjs';
import styled from 'styled-components';
import { cloneDeep, debounce, isEqual } from 'lodash';
import type {
  ControlGroupCreationOptions,
  FieldFilterPredicate,
} from '@kbn/controls-plugin/public/control_group/types';
import { useInitializeUrlParam } from '../../utils/global_query_string';
import { URL_PARAM_KEY } from '../../hooks/use_url_state';
import type { FilterGroupProps, FilterItemObj } from './types';
import { useFilterUpdatesToUrlSync } from './hooks/use_filter_update_to_url_sync';
import { APP_ID } from '../../../../common/constants';
import './index.scss';
import { FilterGroupLoading } from './loading';
import { withSpaceId } from '../with_space_id';
import { useControlGroupSyncToLocalStorage } from './hooks/use_control_group_sync_to_local_storage';
import { useViewEditMode } from './hooks/use_view_edit_mode';
import { FilterGroupContextMenu } from './context_menu';
import { AddControl, SaveControls } from './buttons';
import { getFilterItemObjListFromControlInput } from './utils';
import { FiltersChangedBanner } from './filters_changed_banner';
import { FilterGroupContext } from './filter_group_context';
import { NUM_OF_CONTROLS } from './config';
import { COMMON_OPTIONS_LIST_CONTROL_INPUTS, TEST_IDS, TIMEOUTS } from './constants';
import { URL_PARAM_ARRAY_EXCEPTION_MSG } from './translations';
import { convertToBuildEsQuery } from '../../lib/kuery';

const FilterWrapper = styled.div.attrs((props) => ({
  className: props.className,
}))`
  & .euiFilterButton-hasActiveFilters {
    font-weight: 400;
  }

  & .controlGroup {
    min-height: 40px;
  }
`;

const FilterGroupComponent = (props: PropsWithChildren<FilterGroupProps>) => {
  const {
    dataViewId,
    onFilterChange,
    timeRange,
    filters,
    query,
    chainingSystem,
    initialControls,
    spaceId,
    onInit,
  } = props;

  const filterChangedSubscription = useRef<Subscription>();
  const inputChangedSubscription = useRef<Subscription>();
  const controlGroupOutputSubscription = useRef<Subscription>();

  const [controlGroup, setControlGroup] = useState<ControlGroupContainer>();

  const localStoragePageFilterKey = useMemo(
    () => `${APP_ID}.${spaceId}.${URL_PARAM_KEY.pageFilter}`,
    [spaceId]
  );

  const currentFiltersRef = useRef<Filter[]>();

  const {
    isViewMode,
    hasPendingChanges,
    pendingChangesPopoverOpen,
    closePendingChangesPopover,
    openPendingChangesPopover,
    switchToViewMode,
    switchToEditMode,
    setHasPendingChanges,
  } = useViewEditMode({
    controlGroup,
  });

  const {
    controlGroupInput: controlGroupInputUpdates,
    setControlGroupInput: setControlGroupInputUpdates,
    getStoredControlGroupInput: getStoredControlInput,
  } = useControlGroupSyncToLocalStorage({
    storageKey: localStoragePageFilterKey,
    shouldSync: isViewMode,
  });

  const [initialUrlParam, setInitialUrlParam] = useState<FilterItemObj[]>();

  const [showFiltersChangedBanner, setShowFiltersChangedBanner] = useState(false);

  const urlDataApplied = useRef<boolean>(false);

  const onUrlParamInit = (param: FilterItemObj[] | null) => {
    if (!param) {
      setInitialUrlParam([]);
      return;
    }
    try {
      if (!Array.isArray(param)) {
        throw new Error(URL_PARAM_ARRAY_EXCEPTION_MSG);
      }
      const storedControlGroupInput = getStoredControlInput();
      if (storedControlGroupInput) {
        const panelsFormatted = getFilterItemObjListFromControlInput(storedControlGroupInput);
        if (!isEqual(panelsFormatted, param)) {
          setShowFiltersChangedBanner(true);
          switchToEditMode();
        }
      }
      setInitialUrlParam(param);
    } catch (err) {
      // if there is an error ignore url Param
      // eslint-disable-next-line no-console
      console.error(err);
      setInitialUrlParam([]);
    }
  };

  useInitializeUrlParam(URL_PARAM_KEY.pageFilter, onUrlParamInit);

  useEffect(() => {
    const cleanup = () => {
      [filterChangedSubscription.current, inputChangedSubscription.current].forEach((sub) => {
        if (sub) sub.unsubscribe();
      });
    };
    return cleanup;
  }, []);

  const { filters: validatedFilters, query: validatedQuery } = useMemo(() => {
    const [_, kqlError] = convertToBuildEsQuery({
      config: {},
      queries: query ? [query] : [],
      filters: filters ?? [],
      indexPattern: { fields: [], title: '' },
    });

    // we only need to handle kqlError because control group can handle Lucene error
    if (kqlError) {
      /*
       * Based on the behaviour from other components,
       * ignore all filters and queries if there is some error
       * in the input filters and queries
       *
       * */
      return {
        filters: [],
        query: undefined,
      };
    }
    return {
      filters,
      query,
    };
  }, [filters, query]);

  useEffect(() => {
    controlGroup?.updateInput({
      filters: validatedFilters,
      query: validatedQuery,
      timeRange,
      chainingSystem,
    });
  }, [timeRange, chainingSystem, controlGroup, validatedQuery, validatedFilters]);

  const handleInputUpdates = useCallback(
    (newInput: ControlGroupInput) => {
      if (isEqual(getStoredControlInput(), newInput)) {
        return;
      }
      if (!isEqual(newInput.panels, getStoredControlInput()?.panels) && !isViewMode) {
        setHasPendingChanges(true);
      }
      setControlGroupInputUpdates(newInput);
    },
    [setControlGroupInputUpdates, getStoredControlInput, isViewMode, setHasPendingChanges]
  );

  const handleOutputFilterUpdates = useCallback(
    ({ filters: newFilters, embeddableLoaded }: ControlGroupOutput) => {
      const haveAllEmbeddablesLoaded = Object.values(embeddableLoaded).every(Boolean);
      if (isEqual(currentFiltersRef.current, newFilters)) return;
      if (!haveAllEmbeddablesLoaded) return;
      if (onFilterChange) onFilterChange(newFilters ?? []);
      currentFiltersRef.current = newFilters ?? [];
    },
    [onFilterChange]
  );

  const debouncedFilterUpdates = useMemo(
    () => debounce(handleOutputFilterUpdates, TIMEOUTS.FILTER_UPDATES_DEBOUNCE_TIME),
    [handleOutputFilterUpdates]
  );

  useEffect(() => {
    if (!controlGroup) return;
    filterChangedSubscription.current = controlGroup.getOutput$().subscribe({
      next: debouncedFilterUpdates,
    });

    inputChangedSubscription.current = controlGroup.getInput$().subscribe({
      next: handleInputUpdates,
    });

    const cleanup = () => {
      [filterChangedSubscription.current, inputChangedSubscription.current].forEach((sub) => {
        if (sub) sub.unsubscribe();
      });
    };
    return cleanup;
  }, [controlGroup, debouncedFilterUpdates, handleInputUpdates]);

  const onControlGroupLoadHandler = useCallback(
    (controlGroupContainer: ControlGroupContainer) => {
      if (!controlGroupContainer) return;
      if (onInit) onInit(controlGroupContainer);
      setControlGroup(controlGroupContainer);
    },
    [onInit]
  );

  const selectControlsWithPriority = useCallback(() => {
    /*
     *
     * Below is the priority of how controls are fetched.
     *  1. URL
     *  2. If not found in URL, see in Localstorage
     *  3. If not found in Localstorage, defaultControls are assigned
     *
     * */

    const localInitialControls = cloneDeep(initialControls).filter(
      (control) => control.persist === true
    );
    let resultControls = [] as FilterItemObj[];

    let overridingControls = initialUrlParam;
    if (!initialUrlParam || initialUrlParam.length === 0) {
      // if nothing is found in URL Param.. read from local storage
      const storedControlGroupInput = getStoredControlInput();
      if (storedControlGroupInput) {
        const urlParamsFromLocalStorage: FilterItemObj[] =
          getFilterItemObjListFromControlInput(storedControlGroupInput);

        overridingControls = urlParamsFromLocalStorage;
      }
    }

    if (!overridingControls || overridingControls.length === 0) return initialControls;

    // if initialUrlParam Exists... replace localInitialControls with what was provided in the Url
    if (overridingControls && !urlDataApplied.current) {
      if (localInitialControls.length > 0) {
        localInitialControls.forEach((persistControl) => {
          const doesPersistControlAlreadyExist = overridingControls?.some(
            (control) => control.fieldName === persistControl.fieldName
          );

          if (!doesPersistControlAlreadyExist) {
            resultControls.push(persistControl);
          }
        });
      }

      resultControls = [
        ...resultControls,
        ...overridingControls.map((item) => ({
          fieldName: item.fieldName,
          title: item.title,
          selectedOptions: item.selectedOptions ?? [],
          existsSelected: item.existsSelected ?? false,
          exclude: item.exclude,
        })),
      ];
    }

    return resultControls;
  }, [initialUrlParam, initialControls, getStoredControlInput]);

  const fieldFilterPredicate: FieldFilterPredicate = useCallback((f) => f.type !== 'number', []);

  const getCreationOptions: ControlGroupRendererProps['getCreationOptions'] = useCallback(
    async (
      defaultInput: Partial<ControlGroupInput>,
      { addOptionsListControl }: ControlGroupInputBuilder
    ) => {
      const initialInput: Partial<ControlGroupInput> = {
        ...defaultInput,
        defaultControlWidth: 'small',
        viewMode: ViewMode.VIEW,
        timeRange,
        filters,
        query,
        chainingSystem,
      };

      const finalControls = selectControlsWithPriority();

      urlDataApplied.current = true;

      finalControls.forEach((control, idx) => {
        addOptionsListControl(initialInput, {
          controlId: String(idx),
          ...COMMON_OPTIONS_LIST_CONTROL_INPUTS,
          // option List controls will handle an invalid dataview
          // & display an appropriate message
          dataViewId: dataViewId ?? '',
          ...control,
        });
      });

      return {
        initialInput,
        settings: {
          showAddButton: false,
          staticDataViewId: dataViewId ?? '',
          editorConfig: {
            hideWidthSettings: true,
            hideDataViewSelector: true,
            hideAdditionalSettings: true,
          },
        },
        fieldFilterPredicate,
      } as ControlGroupCreationOptions;
    },
    [
      dataViewId,
      timeRange,
      filters,
      chainingSystem,
      query,
      selectControlsWithPriority,
      fieldFilterPredicate,
    ]
  );

  useFilterUpdatesToUrlSync({
    controlGroupInput: controlGroupInputUpdates,
  });

  const discardChangesHandler = useCallback(() => {
    if (hasPendingChanges) {
      controlGroup?.updateInput({
        panels: getStoredControlInput()?.panels,
      });
    }
    switchToViewMode();
    setShowFiltersChangedBanner(false);
  }, [controlGroup, switchToViewMode, getStoredControlInput, hasPendingChanges]);

  const upsertPersistableControls = useCallback(async () => {
    const persistableControls = initialControls.filter((control) => control.persist === true);
    const persistableFieldNames = persistableControls.map((p) => p.fieldName);
    if (persistableControls.length > 0) {
      const currentPanels = Object.values(controlGroup?.getInput().panels ?? []) as Array<
        ControlPanelState<OptionsListEmbeddableInput>
      >;
      const orderedPanels = currentPanels.sort((a, b) => a.order - b.order);
      let filterControlsDeleted = false;
      for (const persistableControl of persistableControls) {
        const persistableControlInExistingPanels = currentPanels.find(
          (currControl) => persistableControl.fieldName === currControl.explicitInput.fieldName
        );
        // delete current controls
        if (!filterControlsDeleted) {
          controlGroup?.updateInput({ panels: {}, filters: [] });
          filterControlsDeleted = true;
        }

        // add persitable controls
        await controlGroup?.addOptionsListControl({
          title: persistableControl.title,
          ...COMMON_OPTIONS_LIST_CONTROL_INPUTS,
          // option List controls will handle an invalid dataview
          // & display an appropriate message
          dataViewId: dataViewId ?? '',
          selectedOptions: persistableControl.selectedOptions,
          ...persistableControl,
          // restore actual values
          ...persistableControlInExistingPanels?.explicitInput,
        });
      }

      for (const panel of orderedPanels) {
        // add rest of the ordered panels
        if (
          panel.explicitInput.fieldName &&
          !persistableFieldNames.includes(panel.explicitInput.fieldName)
        )
          await controlGroup?.addOptionsListControl({
            selectedOptions: [],
            fieldName: panel.explicitInput.fieldName,
            dataViewId: dataViewId ?? '',
            ...panel.explicitInput,
          });
      }
    }
  }, [controlGroup, dataViewId, initialControls]);

  const saveChangesHandler = useCallback(async () => {
    await upsertPersistableControls();
    switchToViewMode();
    setShowFiltersChangedBanner(false);
  }, [switchToViewMode, upsertPersistableControls]);

  const newControlInputTranform: ControlInputTransform = (newInput, controlType) => {
    // for any new controls, we want to avoid
    // default placeholder
    if (controlType === OPTIONS_LIST_CONTROL) {
      return {
        ...newInput,
        placeholder: '',
      };
    }
    return newInput;
  };

  const addControlsHandler = useCallback(() => {
    controlGroup?.openAddDataControlFlyout({
      controlInputTransform: newControlInputTranform,
    });
  }, [controlGroup]);

  return (
    <FilterGroupContext.Provider
      value={{
        dataViewId: dataViewId ?? '',
        initialControls,
        isViewMode,
        controlGroup,
        controlGroupInputUpdates,
        hasPendingChanges,
        pendingChangesPopoverOpen,
        setHasPendingChanges,
        switchToEditMode,
        switchToViewMode,
        openPendingChangesPopover,
        closePendingChangesPopover,
        setShowFiltersChangedBanner,
        saveChangesHandler,
        discardChangesHandler,
      }}
    >
      <FilterWrapper className="filter-group__wrapper">
        <EuiFlexGroup alignItems="center" justifyContent="center" gutterSize="s">
          {Array.isArray(initialUrlParam) ? (
            <EuiFlexItem grow={true} data-test-subj={TEST_IDS.FILTER_CONTROLS}>
              <ControlGroupRenderer
                ref={onControlGroupLoadHandler}
                getCreationOptions={getCreationOptions}
              />
              {!controlGroup ? <FilterGroupLoading /> : null}
            </EuiFlexItem>
          ) : null}
          {!isViewMode && !showFiltersChangedBanner ? (
            <>
              <EuiFlexItem grow={false}>
                <AddControl
                  onClick={addControlsHandler}
                  isDisabled={
                    controlGroupInputUpdates &&
                    Object.values(controlGroupInputUpdates.panels).length >= NUM_OF_CONTROLS.MAX
                  }
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <SaveControls onClick={saveChangesHandler} />
              </EuiFlexItem>
            </>
          ) : null}
          <EuiFlexItem grow={false}>
            <FilterGroupContextMenu />
          </EuiFlexItem>
        </EuiFlexGroup>
        {showFiltersChangedBanner ? (
          <>
            <EuiSpacer size="l" />
            <FiltersChangedBanner
              saveChangesHandler={saveChangesHandler}
              discardChangesHandler={discardChangesHandler}
            />
          </>
        ) : null}
      </FilterWrapper>
    </FilterGroupContext.Provider>
  );
};

// FilterGroupNeeds spaceId to be invariant because it is being used in localstorage
// Hence we will render component only when spaceId has a value.
export const FilterGroup = withSpaceId<FilterGroupProps>(
  FilterGroupComponent,
  <FilterGroupLoading />
);
