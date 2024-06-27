/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentProps } from 'react';
import React from 'react';
import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import styled from 'styled-components';
import type { EuiTheme } from '@kbn/react-kibana-context-styled';
import { NoteCards } from '../../notes/note_cards';
import * as i18n from './translations';

export type NotesFlyoutProps = {
  show: boolean;
  onClose: () => void;
} & Pick<
  ComponentProps<typeof NoteCards>,
  'eventId' | 'notes' | 'associateNote' | 'toggleShowAddNote' | 'timelineId'
>;

/*
 * z-index override is needed because otherwise NotesFlyout appears below
 * Timeline Modal as they both have same z-index of 1000
 */
export const NotesFlyoutContainer = styled(EuiFlyout)`
  z-index: ${(props) =>
    ((props.theme as EuiTheme).eui.euiZFlyout.toFixed() ?? 1000) + 2} !important;
`;

export const NotesFlyout = React.memo(function NotesFlyout(props: NotesFlyoutProps) {
  const { eventId, toggleShowAddNote, show, onClose, associateNote, notes, timelineId } = props;

  const notesFlyoutTitleId = useGeneratedHtmlId({
    prefix: 'notesFlyoutTitle',
  });

  if (!show) {
    return null;
  }

  return (
    <NotesFlyoutContainer
      ownFocus={false}
      className="timeline-notes-flyout"
      data-test-subj="timeline-notes-flyout"
      onClose={onClose}
      aria-labelledby={notesFlyoutTitleId}
      maxWidth={750}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>{i18n.NOTES}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <NoteCards
          ariaRowindex={0}
          associateNote={associateNote}
          className="notes-in-flyout"
          data-test-subj="note-cards"
          notes={notes}
          showAddNote={true}
          toggleShowAddNote={toggleShowAddNote}
          eventId={eventId}
          timelineId={timelineId}
        />
      </EuiFlyoutBody>
    </NotesFlyoutContainer>
  );
});
