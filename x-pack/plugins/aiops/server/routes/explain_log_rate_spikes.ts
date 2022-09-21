/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk } from 'lodash';

import type * as estypes from '@elastic/elasticsearch/lib/api/typesWithBodyKey';

import { i18n } from '@kbn/i18n';
import { asyncForEach } from '@kbn/std';
import type { IRouter } from '@kbn/core/server';
import { KBN_FIELD_TYPES } from '@kbn/field-types';
import type { Logger } from '@kbn/logging';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import { streamFactory } from '@kbn/aiops-utils';
import type { ChangePoint, NumericChartData, NumericHistogramField } from '@kbn/ml-agg-utils';
import { fetchHistogramsForFields } from '@kbn/ml-agg-utils';
import { stringHash } from '@kbn/ml-string-hash';

import {
  addChangePointsAction,
  addChangePointsGroupAction,
  addChangePointsGroupHistogramAction,
  addChangePointsHistogramAction,
  aiopsExplainLogRateSpikesSchema,
  addErrorAction,
  resetAction,
  updateLoadingStateAction,
  AiopsExplainLogRateSpikesApiAction,
} from '../../common/api/explain_log_rate_spikes';
import { API_ENDPOINT } from '../../common/api';

import type { AiopsLicense } from '../types';

import { fetchChangePointPValues } from './queries/fetch_change_point_p_values';
import { fetchFieldCandidates } from './queries/fetch_field_candidates';
import {
  dropDuplicates,
  fetchFrequentItems,
  groupDuplicates,
} from './queries/fetch_frequent_items';
import type { ItemsetResult } from './queries/fetch_frequent_items';
import {
  getFieldValuePairCounts,
  getSimpleHierarchicalTree,
  getSimpleHierarchicalTreeLeaves,
  markDuplicates,
} from './queries/get_simple_hierarchical_tree';

// Overall progress is a float from 0 to 1.
const LOADED_FIELD_CANDIDATES = 0.2;
const PROGRESS_STEP_P_VALUES = 0.6;
const PROGRESS_STEP_HISTOGRAMS = 0.2;

export const defineExplainLogRateSpikesRoute = (
  router: IRouter<DataRequestHandlerContext>,
  license: AiopsLicense,
  logger: Logger
) => {
  router.post(
    {
      path: API_ENDPOINT.EXPLAIN_LOG_RATE_SPIKES,
      validate: {
        body: aiopsExplainLogRateSpikesSchema,
      },
    },
    async (context, request, response) => {
      if (!license.isActivePlatinumLicense) {
        return response.forbidden();
      }

      const groupingEnabled = !!request.body.grouping;

      const client = (await context.core).elasticsearch.client.asCurrentUser;

      const controller = new AbortController();

      let loaded = 0;
      let shouldStop = false;
      request.events.aborted$.subscribe(() => {
        shouldStop = true;
        controller.abort();
      });
      request.events.completed$.subscribe(() => {
        shouldStop = true;
        controller.abort();
      });

      const { end, push, responseWithHeaders } = streamFactory<AiopsExplainLogRateSpikesApiAction>(
        request.headers,
        logger,
        true
      );

      function endWithUpdatedLoadingState() {
        push(
          updateLoadingStateAction({
            ccsWarning: false,
            loaded: 1,
            loadingState: i18n.translate(
              'xpack.aiops.explainLogRateSpikes.loadingState.doneMessage',
              {
                defaultMessage: 'Done.',
              }
            ),
          })
        );

        end();
      }

      // Async IIFE to run the analysis while not blocking returning `responseWithHeaders`.
      (async () => {
        push(resetAction());
        push(
          updateLoadingStateAction({
            ccsWarning: false,
            loaded,
            loadingState: i18n.translate(
              'xpack.aiops.explainLogRateSpikes.loadingState.loadingFieldCandidates',
              {
                defaultMessage: 'Loading field candidates.',
              }
            ),
          })
        );

        let fieldCandidates: Awaited<ReturnType<typeof fetchFieldCandidates>>;
        try {
          fieldCandidates = await fetchFieldCandidates(client, request.body);
        } catch (e) {
          push(addErrorAction(e.toString()));
          end();
          return;
        }

        loaded += LOADED_FIELD_CANDIDATES;

        push(
          updateLoadingStateAction({
            ccsWarning: false,
            loaded,
            loadingState: i18n.translate(
              'xpack.aiops.explainLogRateSpikes.loadingState.identifiedFieldCandidates',
              {
                defaultMessage:
                  'Identified {fieldCandidatesCount, plural, one {# field candidate} other {# field candidates}}.',
                values: {
                  fieldCandidatesCount: fieldCandidates.length,
                },
              }
            ),
          })
        );

        if (fieldCandidates.length === 0) {
          endWithUpdatedLoadingState();
        } else if (shouldStop) {
          end();
          return;
        }

        const changePoints: ChangePoint[] = [];
        const fieldsToSample = new Set<string>();
        const chunkSize = 10;

        const fieldCandidatesChunks = chunk(fieldCandidates, chunkSize);

        for (const fieldCandidatesChunk of fieldCandidatesChunks) {
          let pValues: Awaited<ReturnType<typeof fetchChangePointPValues>>;
          try {
            pValues = await fetchChangePointPValues(client, request.body, fieldCandidatesChunk);
          } catch (e) {
            push(addErrorAction(e.toString()));
            end();
            return;
          }

          if (pValues.length > 0) {
            pValues.forEach((d) => {
              fieldsToSample.add(d.fieldName);
            });
            changePoints.push(...pValues);
          }

          loaded += (1 / fieldCandidatesChunks.length) * PROGRESS_STEP_P_VALUES;
          if (pValues.length > 0) {
            push(addChangePointsAction(pValues));
          }
          push(
            updateLoadingStateAction({
              ccsWarning: false,
              loaded,
              loadingState: i18n.translate(
                'xpack.aiops.explainLogRateSpikes.loadingState.identifiedFieldValuePairs',
                {
                  defaultMessage:
                    'Identified {fieldValuePairsCount, plural, one {# significant field/value pair} other {# significant field/value pairs}}.',
                  values: {
                    fieldValuePairsCount: changePoints?.length ?? 0,
                  },
                }
              ),
            })
          );

          if (shouldStop) {
            end();
            return;
          }
        }

        if (changePoints?.length === 0) {
          endWithUpdatedLoadingState();
          return;
        }

        const histogramFields: [NumericHistogramField] = [
          { fieldName: request.body.timeFieldName, type: KBN_FIELD_TYPES.DATE },
        ];

        const [overallTimeSeries] = (await fetchHistogramsForFields(
          client,
          request.body.index,
          { match_all: {} },
          // fields
          histogramFields,
          // samplerShardSize
          -1,
          undefined
        )) as [NumericChartData];

        if (groupingEnabled) {
          // To optimize the `frequent_items` query, we identify duplicate change points by count attributes.
          // Note this is a compromise and not 100% accurate because there could be change points that
          // have the exact same counts but still don't co-occur.
          const duplicateIdentifier: Array<keyof ChangePoint> = [
            'doc_count',
            'bg_count',
            'total_doc_count',
            'total_bg_count',
          ];

          // These are the deduplicated change points we pass to the `frequent_items` aggregation.
          const deduplicatedChangePoints = dropDuplicates(changePoints, duplicateIdentifier);

          // We use the grouped change points to later repopulate
          // the `frequent_items` result with the missing duplicates.
          const groupedChangePoints = groupDuplicates(changePoints, duplicateIdentifier).filter(
            (g) => g.group.length > 1
          );

          const { fields, df } = await fetchFrequentItems(
            client,
            request.body.index,
            JSON.parse(request.body.searchQuery) as estypes.QueryDslQueryContainer,
            deduplicatedChangePoints,
            request.body.timeFieldName,
            request.body.deviationMin,
            request.body.deviationMax
          );

          // The way the `frequent_items` aggregations works could return item sets that include
          // field/value pairs that are not part of the original list of significant change points.
          // This cleans up groups and removes those unrelated field/value pairs.
          const filteredDf = df
            .map((fi) => {
              fi.set = Object.entries(fi.set).reduce<ItemsetResult['set']>(
                (set, [field, value]) => {
                  if (
                    changePoints.some((cp) => cp.fieldName === field && cp.fieldValue === value)
                  ) {
                    set[field] = value;
                  }
                  return set;
                },
                {}
              );
              fi.size = Object.keys(fi.set).length;
              return fi;
            })
            .filter((fi) => fi.size > 1);

          // `frequent_items` returns lot of different small groups of field/value pairs that co-occur.
          // The following steps analyse these small groups, identify overlap between these groups,
          // and then summarize them in larger groups where possible.

          // Get a tree structure based on `frequent_items`.
          const { root } = getSimpleHierarchicalTree(filteredDf, true, false, fields);

          // Each leave of the tree will be a summarized group of co-occuring field/value pairs.
          const treeLeaves = getSimpleHierarchicalTreeLeaves(root, []);

          // To be able to display a more cleaned up results table in the UI, we identify field/value pairs
          // that occur in multiple groups. This will allow us to highlight field/value pairs that are
          // unique to a group in a better way. This step will also re-add duplicates we identified in the
          // beginning and didn't pass on to the `frequent_items` agg.
          const fieldValuePairCounts = getFieldValuePairCounts(treeLeaves);
          const changePointGroups = markDuplicates(treeLeaves, fieldValuePairCounts).map((g) => {
            const group = [...g.group];

            for (const groupItem of g.group) {
              const { duplicate } = groupItem;
              const duplicates = groupedChangePoints.find((d) =>
                d.group.some(
                  (dg) =>
                    dg.fieldName === groupItem.fieldName && dg.fieldValue === groupItem.fieldValue
                )
              );

              if (duplicates !== undefined) {
                group.push(
                  ...duplicates.group.map((d) => {
                    return {
                      fieldName: d.fieldName,
                      fieldValue: d.fieldValue,
                      duplicate,
                    };
                  })
                );
              }
            }

            return {
              ...g,
              group,
            };
          });

          // Some field/value pairs might not be part of the `frequent_items` result set, for example
          // because they don't co-occur with other field/value pairs or because of the limits we set on the query.
          // In this next part we identify those missing pairs and add them as individual groups.
          const missingChangePoints = deduplicatedChangePoints.filter((cp) => {
            return !changePointGroups.some((cpg) => {
              return cpg.group.some(
                (d) => d.fieldName === cp.fieldName && d.fieldValue === cp.fieldValue
              );
            });
          });

          changePointGroups.push(
            ...missingChangePoints.map(({ fieldName, fieldValue, doc_count: docCount, pValue }) => {
              const duplicates = groupedChangePoints.find((d) =>
                d.group.some((dg) => dg.fieldName === fieldName && dg.fieldValue === fieldValue)
              );
              if (duplicates !== undefined) {
                return {
                  id: `${stringHash(
                    JSON.stringify(
                      duplicates.group.map((d) => ({
                        fieldName: d.fieldName,
                        fieldValue: d.fieldValue,
                      }))
                    )
                  )}`,
                  group: duplicates.group.map((d) => ({
                    fieldName: d.fieldName,
                    fieldValue: d.fieldValue,
                    duplicate: false,
                  })),
                  docCount,
                  pValue,
                };
              } else {
                return {
                  id: `${stringHash(JSON.stringify({ fieldName, fieldValue }))}`,
                  group: [
                    {
                      fieldName,
                      fieldValue,
                      duplicate: false,
                    },
                  ],
                  docCount,
                  pValue,
                };
              }
            })
          );

          // Finally, we'll find out if there's at least one group with at least two items,
          // only then will we return the groups to the clients and make the grouping option available.
          const maxItems = Math.max(...changePointGroups.map((g) => g.group.length));

          if (maxItems > 1) {
            push(addChangePointsGroupAction(changePointGroups));
          }

          if (changePointGroups) {
            await asyncForEach(changePointGroups, async (cpg, index) => {
              const histogramQuery = {
                bool: {
                  filter: cpg.group.map((d) => ({
                    term: { [d.fieldName]: d.fieldValue },
                  })),
                },
              };

              const [cpgTimeSeries] = (await fetchHistogramsForFields(
                client,
                request.body.index,
                histogramQuery,
                // fields
                [
                  {
                    fieldName: request.body.timeFieldName,
                    type: KBN_FIELD_TYPES.DATE,
                    interval: overallTimeSeries.interval,
                    min: overallTimeSeries.stats[0],
                    max: overallTimeSeries.stats[1],
                  },
                ],
                // samplerShardSize
                -1,
                undefined
              )) as [NumericChartData];

              const histogram =
                overallTimeSeries.data.map((o, i) => {
                  const current = cpgTimeSeries.data.find(
                    (d1) => d1.key_as_string === o.key_as_string
                  ) ?? {
                    doc_count: 0,
                  };
                  return {
                    key: o.key,
                    key_as_string: o.key_as_string ?? '',
                    doc_count_change_point: current.doc_count,
                    doc_count_overall: Math.max(0, o.doc_count - current.doc_count),
                  };
                }) ?? [];

              push(
                addChangePointsGroupHistogramAction([
                  {
                    id: cpg.id,
                    histogram,
                  },
                ])
              );
            });
          }
        }

        // time series filtered by fields
        if (changePoints) {
          await asyncForEach(changePoints, async (cp, index) => {
            if (changePoints) {
              const histogramQuery = {
                bool: {
                  filter: [
                    {
                      term: { [cp.fieldName]: cp.fieldValue },
                    },
                  ],
                },
              };

              const [cpTimeSeries] = (await fetchHistogramsForFields(
                client,
                request.body.index,
                histogramQuery,
                // fields
                [
                  {
                    fieldName: request.body.timeFieldName,
                    type: KBN_FIELD_TYPES.DATE,
                    interval: overallTimeSeries.interval,
                    min: overallTimeSeries.stats[0],
                    max: overallTimeSeries.stats[1],
                  },
                ],
                // samplerShardSize
                -1,
                undefined
              )) as [NumericChartData];

              const histogram =
                overallTimeSeries.data.map((o, i) => {
                  const current = cpTimeSeries.data.find(
                    (d1) => d1.key_as_string === o.key_as_string
                  ) ?? {
                    doc_count: 0,
                  };
                  return {
                    key: o.key,
                    key_as_string: o.key_as_string ?? '',
                    doc_count_change_point: current.doc_count,
                    doc_count_overall: Math.max(0, o.doc_count - current.doc_count),
                  };
                }) ?? [];

              const { fieldName, fieldValue } = cp;

              loaded += (1 / changePoints.length) * PROGRESS_STEP_HISTOGRAMS;
              push(
                updateLoadingStateAction({
                  ccsWarning: false,
                  loaded,
                  loadingState: i18n.translate(
                    'xpack.aiops.explainLogRateSpikes.loadingState.loadingHistogramData',
                    {
                      defaultMessage: 'Loading histogram data.',
                    }
                  ),
                })
              );
              push(
                addChangePointsHistogramAction([
                  {
                    fieldName,
                    fieldValue,
                    histogram,
                  },
                ])
              );
            }
          });
        }

        endWithUpdatedLoadingState();
      })();

      return response.ok(responseWithHeaders);
    }
  );
};
