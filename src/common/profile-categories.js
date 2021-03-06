/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from '../common/time-code';
import { objectEntries, mapObj } from '../common/utils';
import type { Profile, Thread } from './types/profile';

export type Summary = { [id: string]: number };
type MatchingFunction = (string, string) => boolean;
type StacksInCategory = { [id: string]: { [id: string]: number } };
type SummarySegment = {
  percentage?: { [id: string]: number },
  samples: { [id: string]: number },
};
type RollingSummary = SummarySegment[];
type CategoryDatum = {
  category: string | null,
  hangMs: number
};
type Categories = Array<CategoryDatum>;
type ThreadCategories = Categories[];

/**
 * A list of strategies for matching sample names to patterns.
 */
const match: { [id: string]: MatchingFunction } = {
  exact: (symbol, pattern) => symbol === pattern,
  prefix: (symbol, pattern) => symbol.startsWith(pattern),
  substring: (symbol, pattern) => symbol.includes(pattern),
  stem: (symbol, pattern) => {
    return symbol === pattern || symbol.startsWith(pattern + '(');
  },
  ignore: (symbol, pattern) => false,
};

/**
 * Categories is a list that includes the necessary information to match a sample to
 * a category. This list will need to be adjusted as the engine implementation switches.
 * Each category definition is a tuple that takes the following form:
 *
 * [
 *   matches, // A function that returns true/false for how the pattern should be matched.
 *   pattern, // The pattern that should match the sample name.
 *   category, // The category to finally label the sample.
 * ]
 */

const categories = [
  [match.ignore, '', 'content_script'],
  [match.stem, 'mozilla::ipc::MessageChannel::WaitForSyncNotify', 'sync_ipc'],
  [match.stem, 'mozilla::ipc::MessageChannel::WaitForInterruptNotify', 'sync_ipc'],
  [match.prefix, 'mozilla::places::', 'places'],
  [match.prefix, 'mozilla::plugins::', 'plugins'],

  [match.stem, 'js::RunScript', 'script'],
  [match.stem, 'js::Nursery::collect', 'GC'],
  [match.stem, 'js::GCRuntime::collect', 'GC'],
  [match.stem, 'nsJSContext::GarbageCollectNow', 'GC'],
  [match.prefix, 'mozilla::RestyleManager::', 'restyle'],
  [match.substring, 'RestyleManager', 'restyle'],
  [match.stem, 'mozilla::PresShell::ProcessReflowCommands', 'layout'],
  [match.prefix, 'nsCSSFrameConstructor::', 'frameconstruction'],
  [match.stem, 'mozilla::PresShell::DoReflow', 'layout'],
  [match.substring, '::compileScript(', 'script'],

  [match.prefix, 'nsCycleCollector', 'CC'],
  [match.prefix, 'nsPurpleBuffer', 'CC'],
  [match.substring, 'pthread_mutex_lock', 'wait'], // eg __GI___pthread_mutex_lock
  [match.prefix, 'nsRefreshDriver::IsWaitingForPaint', 'paint'], // arguable, I suppose
  [match.stem, 'mozilla::PresShell::Paint', 'paint'],
  [match.prefix, '__poll', 'wait'],
  [match.prefix, '__pthread_cond_wait', 'wait'],
  [match.stem, 'mozilla::PresShell::DoUpdateApproximateFrameVisibility', 'layout'], // could just as well be paint
  [match.substring, 'mozilla::net::', 'network'],
  [match.stem, 'nsInputStreamReadyEvent::Run', 'network'],

  // [match.stem, 'NS_ProcessNextEvent', 'eventloop'],
  [match.stem, 'nsJSUtil::EvaluateString', 'script'],
  [match.prefix, 'js::frontend::Parser', 'script.parse'],
  [match.prefix, 'js::jit::IonCompile', 'script.compile.ion'],
  [
    match.prefix,
    'js::jit::BaselineCompiler::compile',
    'script.compile.baseline',
  ],

  [match.prefix, 'CompositorBridgeParent::Composite', 'paint'],
  [
    match.prefix,
    'mozilla::layers::PLayerTransactionParent::Read(',
    'messageread',
  ],

  [match.prefix, 'mozilla::dom::', 'dom'],
  [match.prefix, 'nsDOMCSSDeclaration::', 'restyle'],
  [match.prefix, 'nsHTMLDNS', 'network'],
  [match.substring, 'IC::update(', 'script.icupdate'],
  [match.prefix, 'js::jit::CodeGenerator::link(', 'script.link'],

  [match.exact, 'base::WaitableEvent::Wait()', 'idle'],
  // TODO - if mach_msg_trap is called by RunCurrentEventLoopInMode, then it
  // should be considered idle time. Add a fourth entry to this tuple
  // for child checks?
  [match.exact, 'mach_msg_trap', 'wait'],

  // Can't do this until we come up with a way of labeling ion/baseline.
  [match.prefix, 'Interpret(', 'script.execute.interpreter'],
];

const seenCategories = {};
export const categoryNames = ['uncategorized'].concat(categories.map(c => c[2]).filter(c => {
  const result = !seenCategories[c];
  seenCategories[c] = true;
  return result;
}));

export function summarizeProfileCategories(profile: Profile) {
  return timeCode('summarizeProfileCategories', () => {
    const threadCategories: ThreadCategories = categorizeThreadData(profile);
    const rollingSummaries: RollingSummary[] = calculateRollingSummaries(
      profile,
      threadCategories
    );
    const summaries = summarizeCategories(profile, threadCategories);

    return profile.threads.map((thread, i) => ({
      threadIndex: i,
      threadName: thread.name,
      rollingSummary: rollingSummaries[i],
      summary: summaries[i],
    }));
  });
}

/**
 * Return a function that categorizes a function name. The categories
 * are cached between calls.
 * @returns {function} Function categorizer.
 */
function functionNameCategorizer() {
  const cache = new Map();
  return function functionNameToCategory(name) {
    const existingCategory = cache.get(name);
    if (existingCategory !== undefined) {
      return existingCategory;
    }

    for (const [matches, pattern, category] of categories) {
      if (matches(name, pattern)) {
        cache.set(name, category);
        return category;
      }
    }

    cache.set(name, false);
    return false;
  };
}

/**
 * A function that categorizes a sample.
 */
type SampleCategorizer = (sampleIndex: number) =>
  | string
  | null;

/**
 * Given a profile, return a function that categorizes a sample.
 * @param {object} thread Thread from a profile.
 * @return {function} Sample stack categorizer.
 */
export function sampleCategorizer(thread: Thread): SampleCategorizer {
  if (thread.sampleTable.category) {
    return function(sampleIndex: number):
      | string
      | null {
      const category = thread.sampleTable.category[sampleIndex];

      return category === null ? null : thread.stringTable._array[category];
    }
  }

  const categorizeFuncName = functionNameCategorizer();

  function computeCategory(stackIndex: number):
    | string
    | null {
    if (stackIndex === -1) {
      return null;
    }

    const funcIndex = thread.stackTable.func[stackIndex];
    const name = thread.stringTable._array[thread.funcTable.name[funcIndex]];
    const category = categorizeFuncName(name);
    if (category !== false && category !== 'wait') {
      return category;
    }

    const prefixCategory = categorizeSampleStack(
      thread.stackTable.prefix[stackIndex]
    );
    if (category === 'wait') {
      if (prefixCategory === null || prefixCategory === 'uncategorized') {
        return 'wait';
      }
      if (prefixCategory.endsWith('.wait') || prefixCategory === 'wait') {
        return prefixCategory;
      }
      return prefixCategory + '.wait';
    }

    return prefixCategory;
  }

  const stackCategoryCache: Map<number, string | null> = new Map();

  function categorizeSampleStack(stackIndex: number | null):
    | string
    | null {
    if (stackIndex === -1 || stackIndex == null) {
      return null;
    }
    let category = stackCategoryCache.get(stackIndex);
    if (category !== undefined) {
      return category;
    }

    category = computeCategory(stackIndex);
    stackCategoryCache.set(stackIndex, category);
    return category;
  }

  return function(sampleIndex: number):
    | string
    | null {
    return categorizeSampleStack(thread.sampleTable.stack[sampleIndex]);
  }
}

/**
 * Count the number of samples in a given category. This will also count subcategories
 * in the case of categories labeled like "script.link", so "script" and "script.link"
 * will each be counted as having a sample.
 * @param {object} summary - Accumulates the counts.
 * @param {string} fullCategoryName - The name of the category.
 * @returns {object} summary
 */
function summarizeSampleCategories(
  summary: Summary,
  datum: CategoryDatum
): Summary {
  const fullCategoryName = datum.category || 'uncategorized';
  const categories = fullCategoryName.split('.');

  while (categories.length > 0) {
    const category = categories.join('.');
    summary[category] = (summary[category] || 0) + datum.hangMs;
    categories.pop();
  }
  return summary;
}

/**
 * Finalize the summary calculation by attaching percentages and sorting the result.
 * @param {object} summary - The object that summarizes the times of the samples.
 * @return {array} The summary with percentages.
 */
function calculateSummaryPercentages(summary: Summary) {
  const rows = objectEntries(summary);

  const sampleCount = rows.reduce(
    (sum: number, [name: string, count: number]) => {
      // Only count the sample if it's not a sub-category. For instance "script.link"
      // is a sub-category of "script".
      return sum + (name.includes('.') ? 0 : count);
    },
    0
  );

  return (
    rows
      .map(([category, samples]) => {
        const percentage = samples / sampleCount;
        return { category, samples, percentage };
      })
      // Sort by sample count, then by name so that the results are deterministic.
      .sort((a, b) => {
        if (a.samples === b.samples) {
          return a.category.localeCompare(b.category);
        }
        return b.samples - a.samples;
      })
  );
}

function logStacks(stacksInCategory: StacksInCategory, maxLogLength = 10) {
  const entries = objectEntries(stacksInCategory);
  const data = entries
    .sort(([, { total: a }], [, { total: b }]) => b - a)
    .slice(0, Math.min(maxLogLength, entries.length));

  /* eslint-disable no-console */
  console.log(`Top ${maxLogLength} stacks in selected category`);
  console.log(data);
  /* eslint-enable no-console */
}

function incrementPerThreadCount(
  container: StacksInCategory,
  key: string,
  threadName: string
) {
  const count = container[key] || { total: 0, [threadName]: 0 };
  count.total++;
  count[threadName]++;
  container[key] = count;
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {array} profile - The current profile.
 * @returns {array} Stacks mapped to categories.
 */
export function categorizeThreadData(profile: Profile): ThreadCategories {
  return timeCode('categorizeThreadData', () => {
    const threadCategories = mapProfileToThreadCategories(profile);
    return threadCategories;
  });
}

function mapProfileToThreadCategories(profile: Profile): ThreadCategories {
  return profile.threads.map(thread => {
    const categorizer = sampleCategorizer(thread);
    return thread.sampleTable.stack.map((s, i) => ({
      category: categorizer(i),
      hangMs: thread.sampleTable.sampleHangMs[i],
    }));
  });
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {object} profile - The profile to summarize.
 * @param {object} threadCategories - Each thread's categories for the samples.
 * @returns {object} The summaries of each thread.
 */
export function summarizeCategories(
  profile: Profile,
  threadCategories: ThreadCategories
) {
  return threadCategories
    .map(categories => categories.reduce(summarizeSampleCategories, {}))
    .map(calculateSummaryPercentages);
}

export function calculateRollingSummaries(
  profile: Profile,
  threadCategories: ThreadCategories,
): RollingSummary[] {
  return profile.threads.map((thread, threadIndex) => {
    const categories = threadCategories[threadIndex];
    const rollingSummary: RollingSummary = [];
    let maxTime = 0;

    for (let i = 0; i < thread.dates.length; i++) {
      let totalTime = 0;
      const samples: { [string]: number } = {};

      for (let j = 0; j < thread.dates[i].sampleHangMs.length; j++) {
        const category = categories[j].category || 'uncategorized';
        samples[category] = samples[category] || 0;
        samples[category] += thread.dates[i].sampleHangMs[j];
        totalTime += thread.dates[i].sampleHangMs[j];
      }

      for (let [key, time] of objectEntries(samples)) {
        if (time > maxTime) {
          maxTime = time;
        }
      }

      rollingSummary.push({
        samples,
      });
    }

    rollingSummary.forEach(s => {
      s.percentage = mapObj(s.samples, count => count / maxTime);
    });

    return rollingSummary;
  });
}
