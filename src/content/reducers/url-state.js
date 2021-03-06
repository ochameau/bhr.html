// @flow
import { combineReducers } from 'redux';
import { defaultThreadOrder } from '../profile-data';
import { createSelector } from 'reselect';
import { urlFromState } from '../url-handling';
import * as RangeFilters from '../range-filters';

import type { ThreadIndex } from '../../common/types/profile';
import type { StartEndRange } from '../../common/types/units';
import type {
  Action, CallTreeFiltersPerThread, CallTreeFilter,
} from '../actions/types';
import type { State, URLState, ExploreURLState, TrackURLState, Reducer } from './types';

function mode(state: string = 'none', action: Action) {
  return state;
}

function trackedStat(state: string = 'All Hangs', action: Action) {
  return state;
}

function payloadID(state: string | null = null, action: Action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_TELEMETRY':
      return action.profile.uuid;
    default:
      return state;
  }
}

function historical(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_TELEMETRY':
      return !!action.historical;
    default:
      return state;
  }
}

function durationSpec(state: string = '2048_65536', action: Action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_TELEMETRY':
      return action.durationSpec;
    default:
      return state;
  }
}

function selectedTab(state: string = 'calltree', action: Action) {
  switch (action.type) {
    case 'CHANGE_SELECTED_TAB':
      return action.selectedTab;
    default:
      return state;
  }
}

function rangeFilters(state: StartEndRange[] = [], action: Action) {
  switch (action.type) {
    case 'ADD_RANGE_FILTER': {
      const { start, end } = action;
      return [...state, { start, end }];
    }
    case 'POP_RANGE_FILTERS':
      return state.slice(0, action.firstRemovedFilterIndex);
    default:
      return state;
  }
}

function selectedThread(state: ThreadIndex = 0, action: Action) {
  switch (action.type) {
    case 'CHANGE_SELECTED_THREAD':
      return action.selectedThread;
    case 'RECEIVE_PROFILE_FROM_TELEMETRY': {
      // When loading in a brand new profile, select either the GeckoMain [tab] thread,
      // or the first thread in the thread order. For profiles from the Web, the
      // selectedThread has already been initialized from the URL and does not require
      // looking at the profile.
      const contentThreadId = action.profile.threads.findIndex(thread => {
        return thread.name === 'GeckoMain' && thread.processType === 'tab';
      });
      return contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(action.profile.threads)[0];
    }
    default:
      return state;
  }
}

function callTreeSearchString(state: string = '', action: Action) {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function callTreeFilters(state: CallTreeFiltersPerThread = {}, action: Action) {
  switch (action.type) {
    case 'ADD_CALL_TREE_FILTER': {
      const { threadIndex, filter } = action;
      const oldFilters = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: [...oldFilters, filter],
      });
    }
    case 'POP_CALL_TREE_FILTERS': {
      const { threadIndex, firstRemovedFilterIndex } = action;
      const oldFilters = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: oldFilters.slice(0, firstRemovedFilterIndex),
      });
    }
    default:
      return state;
  }
}

function invertCallstack(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
      return action.invertCallstack;
    default:
      return state;
  }
}

function onlyUserInteracting(state: boolean = true, action: Action) {
  switch (action.type) {
    case 'CHANGE_ONLY_USER_INTERACTING':
      return action.onlyUserInteracting;
    default:
      return state;
  }
}

function hidePlatformDetails(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'CHANGE_HIDE_PLATFORM_DETAILS':
      return action.hidePlatformDetails;
    default:
      return state;
  }
}

function platformFilter(state: string = '', action: Action) {
  switch (action.type) {
    case 'CHANGE_PLATFORM':
      return action.platform;
    default:
      return state;
  }
}

function categoryFilter(state: string = 'all', action: Action) {
  switch (action.type) {
    case 'CHANGE_CATEGORY':
      return action.category;
    default:
      return state;
  }
}

function runnableFilter(state: string | null = null, action: Action) {
  switch (action.type) {
    case 'CHANGE_RUNNABLE':
      return action.runnable;
    default:
      return state;
  }
}

const urlStateReducer: Reducer<URLState> = (regularUrlStateReducer => (state: URLState, action: Action): URLState => {
  switch (action.type) {
    case '@@urlenhancer/updateURLState':
      return action.urlState;
    default:
      return regularUrlStateReducer(state, action);
  }
})(combineReducers({
  selectedTab, rangeFilters, selectedThread,
  callTreeSearchString, callTreeFilters, invertCallstack,
  hidePlatformDetails, categoryFilter, platformFilter, 
  runnableFilter, durationSpec, onlyUserInteracting,
  payloadID, historical, mode, trackedStat,
}));
export default urlStateReducer;

const getURLState = (state: State): URLState => state.urlState;
const getExploreURLState = (state: State): ExploreURLState => (state.urlState : any);
const getTrackURLState = (state: State): TrackURLState => (state.urlState : any);

export const getMode = (state: State) => getURLState(state).mode;
export const getTrackedStat = (state: State) => getTrackURLState(state).trackedStat;
export const getPayloadID = (state: State) => getExploreURLState(state).payloadID;
export const getDurationSpec = (state: State) => getExploreURLState(state).durationSpec;
export const getHistorical = (state: State) => getExploreURLState(state).historical;
export const getRangeFilters = (state: State) => getExploreURLState(state).rangeFilters;
export const getHidePlatformDetails = (state: State) => getExploreURLState(state).hidePlatformDetails;
export const getInvertCallstack = (state: State) => getExploreURLState(state).invertCallstack;
export const getOnlyUserInteracting = (state: State) => getExploreURLState(state).onlyUserInteracting;
export const getCategoryFilter = (state: State) => getExploreURLState(state).categoryFilter;
export const getPlatformFilter = (state: State) => getExploreURLState(state).platformFilter;
export const getRunnableFilter = (state: State) => getExploreURLState(state).runnableFilter;
export const getSearchString = (state: State) => getExploreURLState(state).callTreeSearchString;
export const getSelectedTab = (state: State) => getExploreURLState(state).selectedTab;
export const getSelectedThreadIndex = (state: State) => getExploreURLState(state).selectedThread;
export const getCallTreeFilters = (state: State, threadIndex: ThreadIndex): CallTreeFilter[] => {
  return getExploreURLState(state).callTreeFilters[threadIndex] || [];
};

export const getURLPredictor = createSelector(
  getURLState,
  (oldURLState: URLState) => actionOrActionList => {
    const actionList = ('type' in actionOrActionList) ? [actionOrActionList] : actionOrActionList;
    const newURLState = actionList.reduce(urlStateReducer, oldURLState);
    return urlFromState(newURLState);
  }
);

export const getRangeFilterLabels = createSelector(
  getRangeFilters,
  RangeFilters.getRangeFilterLabels
);
