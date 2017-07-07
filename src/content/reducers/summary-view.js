/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/actions';
import type { State, SummaryViewState } from '../types/reducers';
import { getProfile } from './profile-view';
import { summarizeProfile } from '../summarize-profile'
import { createSelector } from 'reselect';

export default function summaryViewReducer(
  state: SummaryViewState = { summary: null, expanded: null },
  action: Action
): SummaryViewState {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED': {
      return Object.assign({}, state, {
        summary: action.summary,
        expanded: new Set(),
      });
    }
    case 'PROFILE_SUMMARY_EXPAND': {
      const expanded = new Set(state.expanded);
      expanded.add(action.threadIndex);
      return Object.assign({}, state, { expanded });
    }
    case 'PROFILE_SUMMARY_COLLAPSE': {
      const expanded = new Set(state.expanded);
      expanded.delete(action.threadIndex);
      return Object.assign({}, state, { expanded });
    }
    default:
      return state;
  }
}

export const getSummaryView = createSelector(getProfile, summarizeProfile);

export const getProfileSummaries = createSelector(getSummaryView, summaryView => {
  return summaryView;
});

export const getProfileExpandedSummaries = createSelector(getSummaryView, summaryView => {
  return new Set();
});
