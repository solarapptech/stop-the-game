import * as React from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

 let pendingReset = null;

export function resetTo(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.reset({
      index: 0,
      routes: [{ name, params }],
    });
  } else {
    pendingReset = { name, params };
  }
}

 export function flushPendingNavigation() {
  if (!navigationRef.isReady()) return;
  if (pendingReset) {
    const { name, params } = pendingReset;
    pendingReset = null;
    navigationRef.reset({
      index: 0,
      routes: [{ name, params }],
    });
  }
 }

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
