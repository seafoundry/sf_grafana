import { useEffect, useState } from 'react';

import { config } from '@grafana/runtime';

import { preloadPlugins } from '../pluginPreloader';

import { getAppPluginConfigs } from './utils';

export function useLoadAppPlugins(pluginIds: string[] = []): { isLoading: boolean } {
  const [isLoading, setIsLoading] = useState(false);
  const isEnabled = config.featureToggles.appPluginLazyLoading;

  useEffect(() => {
    if (!isEnabled || isLoading) {
      return;
    }

    const appConfigs = getAppPluginConfigs(pluginIds);

    if (!appConfigs.length) {
      return;
    }

    setIsLoading(true);
    preloadPlugins(appConfigs).then(() => {
      setIsLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isLoading };
}
