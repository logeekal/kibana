/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiDataGridCustomBodyProps } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { EuiTheme } from '@kbn/react-kibana-context-styled';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import type { FC } from 'react';
import React, { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { AutoSizer, CellMeasurerCache } from 'react-virtualized';
import { VariableSizeList } from 'react-window';
import type { RowRenderer } from '../../../../../../common/types';
import { TIMELINE_EVENT_DETAIL_ROW_ID } from '../../body/constants';
import { useStatefulRowRenderer } from '../../body/events/stateful_row_renderer/use_stateful_row_renderer';
import { getEventTypeRowClassName } from './get_event_type_row_classname';

const cache = new CellMeasurerCache({
  defaultHeight: 100,
  fixedWidth: true,
});

export type CustomTimelineDataGridBodyProps = EuiDataGridCustomBodyProps & {
  rows: Array<DataTableRecord & TimelineItem> | undefined;
  enabledRowRenderers: RowRenderer[];
  rowHeight?: number;
  refetch?: () => void;
};

// THE DataGrid Row default is 34px, but we make ours 40 to account for our row actions
const DEFAULT_UDT_ROW_HEIGHT = 34;

/**
 *
 * In order to render the additional row with every event ( which displays the row-renderer, notes and notes editor)
 * we need to pass a way for EuiDataGrid to render the whole grid body via a custom component
 *
 * This component is responsible for styling and accessibility of the custom designed cells.
 *
 * In our case, we need TimelineExpandedRow ( technicall a data grid column which spans the whole width of the data grid)
 * component to be shown as an addendum to the normal event row. As mentioned above, it displays the row-renderer, notes and notes editor
 *
 * Ref: https://eui.elastic.co/#/tabular-content/data-grid-advanced#custom-body-renderer
 *
 * */
export const CustomTimelineDataGridBody: FC<CustomTimelineDataGridBodyProps> = memo(
  function CustomTimelineDataGridBody(props) {
    const {
      Cell,
      visibleColumns,
      visibleRowData,
      rows,
      rowHeight,
      enabledRowRenderers,
      refetch,
      setCustomGridBodyProps,
      headerRow,
      footerRow,
    } = props;

    // Set custom props onto the grid body wrapper
    const bodyRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      setCustomGridBodyProps({
        ref: bodyRef,
        onScroll: () => console.debug('scrollTop:', bodyRef.current?.scrollTop),
      });
    }, [setCustomGridBodyProps]);

    const visibleRows = useMemo(
      () => (rows ?? []).slice(visibleRowData.startRow, visibleRowData.endRow),
      [rows, visibleRowData]
    );

    const headerRowRef = useRef<HTMLDivElement | null>(null);
    const [gridWidth, setGridWidth] = useState<number | undefined>(undefined);

    useEffect(() => {
      if (headerRowRef.current) {
        setGridWidth(headerRowRef.current.clientWidth);
      }
    }, [headerRow]);

    const listRef = useRef(null);

    const rowHeights = useRef<number[]>([]);

    const setRowHeight = useCallback((index: number, height: number) => {
      listRef.current?.resetAfterIndex(index);

      rowHeights.current[index] = height;
    }, []);

    const getRowHeight = useCallback((index: number) => {
      return rowHeights.current[index] ?? 100;
    }, []);

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <AutoSizer className="autosizer">
          {({ height, width }) => {
            return (
              <>
                <div ref={headerRowRef} style={{ width: 'fit-content' }}>
                  {headerRow}
                  {footerRow}
                </div>
                <VariableSizeList
                  width={(gridWidth ?? width) + 22}
                  data-grid-width={gridWidth}
                  height={height - 26}
                  itemCount={visibleRows.length}
                  itemSize={getRowHeight} // dummy. Will not be used
                  overscanCount={10}
                  ref={listRef}
                >
                  {({ index, style }) => {
                    return (
                      <div
                        style={{
                          ...style,
                          width: 'fit-content',
                        }}
                        key={index}
                      >
                        <CustomDataGridSingleRow
                          rowData={visibleRows[index]}
                          rowIndex={index}
                          visibleColumns={visibleColumns}
                          Cell={Cell}
                          enabledRowRenderers={enabledRowRenderers}
                          refetch={refetch}
                          setRowHeight={setRowHeight}
                        />
                      </div>
                    );
                  }}
                </VariableSizeList>
              </>
            );
          }}
        </AutoSizer>
      </div>
    );
  }
);

/**
 *
 * A Simple Wrapper component for displaying a custom grid row
 *
 */
const CustomGridRow = styled.div.attrs<{
  className?: string;
}>((props) => ({
  className: `euiDataGridRow ${props.className ?? ''}`,
  role: 'row',
}))`
  width: fit-content;
  border-bottom: 1px solid ${(props) => (props.theme as EuiTheme).eui.euiBorderThin};
  . euiDataGridRowCell--controlColumn {
    height: ${(props: { $cssRowHeight: string }) => props.$cssRowHeight};
    min-height: ${DEFAULT_UDT_ROW_HEIGHT}px;
  }
  .udt--customRow {
    border-radius: 0;
    padding: ${(props) => (props.theme as EuiTheme).eui.euiDataGridCellPaddingM};
    max-width: ${(props) => (props.theme as EuiTheme).eui.euiPageDefaultMaxWidth};
    width: 85vw;
  }

  .euiCommentEvent__body {
    background-color: ${(props) => (props.theme as EuiTheme).eui.euiColorEmptyShade};
  }

   &:has(.unifiedDataTable__cell--expanded) {
      .euiDataGridRowCell--firstColumn,
      .euiDataGridRowCell--lastColumn,
      .euiDataGridRowCell--controlColumn,
      .udt--customRow {
        ${({ theme }) => `background-color: ${theme.eui.euiColorHighlight};`}
      }
    }
  }
`;

/* below styles as per : https://eui.elastic.co/#/tabular-content/data-grid-advanced#custom-body-renderer */
const CustomGridRowCellWrapper = styled.div.attrs<{
  className?: string;
}>((props) => ({
  className: `rowCellWrapper ${props.className ?? ''}`,
  role: 'row',
}))`
  height: ${(props: { $cssRowHeight: string }) => props.$cssRowHeight};
  .euiDataGridRowCell,
  .euiDataGridRowCell__content {
    min-height: ${DEFAULT_UDT_ROW_HEIGHT}px;
    .unifiedDataTable__rowControl {
      margin-top: -4px;
    }
  }
`;

type CustomTimelineDataGridSingleRowProps = {
  rowData: DataTableRecord & TimelineItem;
  rowIndex: number;
  setRowHeight: (index: number, height: number) => void;
} & Pick<
  CustomTimelineDataGridBodyProps,
  'visibleColumns' | 'Cell' | 'enabledRowRenderers' | 'refetch' | 'rowHeight'
>;

const calculateRowHeightInPixels = (lineHeightMultiple: number): string => {
  // The line height multiple can be negative to indicate "auto" in the unified data table
  if (lineHeightMultiple < 0) return 'auto';
  // The base line-height in pixels is 16px. This would be calculated default by the datagird and we could use
  // the `configRowHeight` prop, but since we own control of our rows via `customGridBody` we have to calculate it ourselves.
  const baseRowLineHeightInPx = 16;
  const rowHeightInPixels = DEFAULT_UDT_ROW_HEIGHT + baseRowLineHeightInPx * lineHeightMultiple;
  return `${rowHeightInPixels}px`;
};

/**
 *
 * RenderCustomBody component above uses this component to display a single row.
 *
 * */
const CustomDataGridSingleRow = memo(function CustomDataGridSingleRow(
  props: CustomTimelineDataGridSingleRowProps
) {
  const {
    rowIndex,
    rowData,
    enabledRowRenderers,
    visibleColumns,
    Cell,
    rowHeight: rowHeightMultiple = 0,
    setRowHeight,
  } = props;
  const { canShowRowRenderer } = useStatefulRowRenderer({
    data: rowData.ecs,
    rowRenderers: enabledRowRenderers,
  });

  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      console.log(`Setting Row Height for row ${rowIndex}`);
      setRowHeight(rowIndex, rowRef.current.offsetHeight);
    }
  }, [rowIndex, setRowHeight]);

  const cssRowHeight: string = calculateRowHeightInPixels(rowHeightMultiple - 1);
  /**
   * removes the border between the actual row ( timelineEvent) and `TimelineEventDetail` row
   * which renders the row-renderer, notes and notes editor
   *
   */
  const cellCustomStyle = useMemo(
    () =>
      canShowRowRenderer
        ? {
            borderBottom: 'none',
          }
        : {},
    [canShowRowRenderer]
  );
  const eventTypeRowClassName = useMemo(() => getEventTypeRowClassName(rowData.ecs), [rowData.ecs]);

  const [rowHeight, _] = useState<number>(0);

  return (
    <CustomGridRow
      className={`${rowIndex % 2 !== 0 ? 'euiDataGridRow--striped' : ''}`}
      $cssRowHeight={cssRowHeight}
      key={rowIndex}
      ref={rowRef}
    >
      <CustomGridRowCellWrapper className={eventTypeRowClassName} $cssRowHeight={cssRowHeight}>
        {visibleColumns.map((column, colIndex) => {
          // Skip the expanded row cell - we'll render it manually outside of the flex wrapper
          if (column.id !== TIMELINE_EVENT_DETAIL_ROW_ID) {
            return (
              <Cell
                style={cellCustomStyle}
                colIndex={colIndex}
                visibleRowIndex={rowIndex}
                key={`${rowIndex},${colIndex}`}
              />
            );
          }
          return null;
        })}
      </CustomGridRowCellWrapper>

      {/* Timeline Expanded Row */}
      {canShowRowRenderer ? (
        <Cell
          /* below style overrides all the styles provided by EUI so should be used carefully */
          style={{
            width: '100%',
          }}
          colIndex={visibleColumns.length - 1} // If the row is being shown, it should always be the last index
          visibleRowIndex={rowIndex}
        />
      ) : null}
    </CustomGridRow>
  );
});
