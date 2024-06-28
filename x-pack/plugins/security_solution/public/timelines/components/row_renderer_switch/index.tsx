/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSwitchEvent } from '@elastic/eui';
import { EuiToolTip, EuiSwitch, EuiFormRow, useGeneratedHtmlId } from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { RowRendererId } from '../../../../common/api/timeline';
import type { State } from '../../../common/store';
import { setExcludedRowRendererIds } from '../../store/actions';
import { selectExcludedRowRendererIds } from '../../store/selectors';
import * as i18n from './translations';

interface RowRendererSwitchProps {
  timelineId: string;
}

const CustomFormRow = styled(EuiFormRow)`
  .euiFormRow__label {
    font-weight: 400;
  }
`;

export const RowRendererSwitch = React.memo(function RowRendererSwitch(
  props: RowRendererSwitchProps
) {
  const toggleTextSwitchId = useGeneratedHtmlId({ prefix: 'rowRendererSwitch' });

  const { timelineId } = props;

  const dispatch = useDispatch();

  const excludedRowRendererIds = useSelector((state: State) =>
    selectExcludedRowRendererIds(state, timelineId)
  );

  const areAllRowRenderersExcluded = useMemo(
    () => Object.values(RowRendererId).every((id) => excludedRowRendererIds.includes(id)),
    [excludedRowRendererIds]
  );

  const [checked, setChecked] = useState(!areAllRowRenderersExcluded);

  const handleDisableAll = useCallback(() => {
    dispatch(
      setExcludedRowRendererIds({
        id: timelineId,
        excludedRowRendererIds: Object.values(RowRendererId),
      })
    );
  }, [dispatch, timelineId]);

  const handleEnableAll = useCallback(() => {
    dispatch(setExcludedRowRendererIds({ id: timelineId, excludedRowRendererIds: [] }));
  }, [dispatch, timelineId]);

  const onChange = (e: EuiSwitchEvent) => {
    setChecked(e.target.checked);
    if (e.target.checked) {
      handleEnableAll();
    } else {
      handleDisableAll();
    }
  };

  const rowRendererLabel = useMemo(
    () => <span id={toggleTextSwitchId}>{i18n.EVENT_RENDERERS_SWITCH}</span>,
    [toggleTextSwitchId]
  );

  useEffect(() => {
    setChecked(!areAllRowRenderersExcluded);
  }, [areAllRowRenderersExcluded]);

  return (
    <EuiToolTip position="top" content={i18n.EVENT_RENDERERS_SWITCH_WARNING}>
      <CustomFormRow display="columnCompressedSwitch" label={rowRendererLabel}>
        <EuiSwitch
          data-test-subj="row-renderer-switch"
          label=""
          checked={checked}
          onChange={onChange}
          compressed
        />
      </CustomFormRow>
    </EuiToolTip>
  );
});
