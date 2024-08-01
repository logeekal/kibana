/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useCallback, useMemo } from 'react';
import { getFieldValue } from '@kbn/discover-utils';
import type { PropsWithChildren } from 'react';
import { ExpandableFlyoutProps, useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import type { DataGridCellValueElementProps } from '@kbn/unified-data-table';
import { HostRightPanel, HostRightPanelProps } from '../../../flyout/panels';
import { DiscoverFlyout } from '../../../flyout';
import { HostDetailsButton } from './button';
import { withExpandableFlyoutProvider } from '../../../common';

const HostCellWithFlyoutRendererComp = React.memo(function HostCellWithFlyoutRendererComp(
  props: PropsWithChildren<DataGridCellValueElementProps>
) {
  const hostName = getFieldValue(props.row, 'host.name');

  const { closeFlyout, openFlyout } = useExpandableFlyoutApi();

  const onClick = useCallback(() => {
    openFlyout({
      right: {
        id: `host-panel-${hostName}-${props.rowIndex}`,
        params: {
          hostName,
        },
      } as HostRightPanelProps,
    });
  }, [openFlyout, hostName, props.rowIndex]);

  const panels: ExpandableFlyoutProps['registeredPanels'] = useMemo(() => {
    return [
      {
        key: `host-panel-${hostName}-${props.rowIndex}`,
        component: (panelProps) => {
          return <HostRightPanel {...(panelProps as HostRightPanelProps).params} />;
        },
      },
    ];
  }, [hostName, props.rowIndex]);

  return (
    <>
      <DiscoverFlyout panels={panels} />
      <HostDetailsButton onClick={onClick}>{hostName}</HostDetailsButton>
    </>
  );
});

export const HostCellWithFlyoutRenderer = withExpandableFlyoutProvider(
  HostCellWithFlyoutRendererComp
);
