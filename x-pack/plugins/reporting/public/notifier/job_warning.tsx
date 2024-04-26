/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CoreStart, ToastInput } from '@kbn/core/public';
import { FormattedMessage } from '@kbn/i18n-react';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { JobId } from '@kbn/reporting-common/types';
import React from 'react';
import { JobSummary } from '../types';
import { DownloadButton } from './job_download_button';
import { ReportLink } from './report_link';

export const getWarningToast = (
  job: JobSummary,
  getReportLink: () => string,
  getDownloadLink: (jobId: JobId) => string,
  core: CoreStart
): ToastInput => ({
  title: toMountPoint(
    <FormattedMessage
      id="xpack.reporting.publicNotifier.warning.title"
      defaultMessage="{reportType} completed with issues"
      values={{ reportType: job.jobtype }}
    />,
    core
  ),
  text: toMountPoint(
    <>
      <p>
        <ReportLink getUrl={getReportLink} />
      </p>
      <DownloadButton getUrl={getDownloadLink} job={job} />
    </>,
    core
  ),
  'data-test-subj': 'completeReportWarning',
});
