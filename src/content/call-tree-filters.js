import { uintArrayToString, stringToUintArray } from './uintarray-encoding';

export function parseCallTreeFilters(stringValue = '') {
  if (!stringValue) {
    return [];
  }
  return stringValue.split('~').map(s => {
    const [type, val] = s.split('-');
    switch (type) {
      case 'prefix':
        return {
          type: 'prefix',
          prefixFuncs: stringToUintArray(val),
        };
      case 'postfix':
        return {
          type: 'postfix',
          postfixFuncs: stringToUintArray(val),
        };
      default:
        return undefined;
    }
  }).filter(f => f);
}

export function stringifyCallTreeFilters(arrayValue = []) {
  return arrayValue.map(filter => {
    switch (filter.type) {
      case 'prefix':
        return 'prefix-' + uintArrayToString(filter.prefixFuncs);
      case 'postfix':
        return 'postfix-' + uintArrayToString(filter.postfixFuncs);
      default:
        throw new Error('unknown filter type');
    }
  }).join('~');
}

export function getCallTreeFilterLabels(thread, callTreeFilters) {
  let threadName = thread.name;
  const { funcTable, stringTable } = thread;
  const labels = callTreeFilters.map(filter => {
    function lastFuncString(funcArray) {
      const lastFunc = funcArray[funcArray.length - 1];
      const nameIndex = funcTable.name[lastFunc];
      return stringTable.getString(nameIndex);
    }
    switch (filter.type) {
      case 'prefix':
        return lastFuncString(filter.prefixFuncs);
      case 'postfix':
        return lastFuncString(filter.postfixFuncs);
      default:
        throw new Error('Unexpected filter type');
    }
  });
  labels.unshift(`Complete "${threadName}"`);
  return labels;
}
