import { useMemo } from 'react';
import { useObservable } from 'react-use';

import { usePluginContext } from '@grafana/data';
import {
  UsePluginComponentOptions,
  UsePluginComponentsResult,
} from '@grafana/runtime/src/services/pluginExtensions/getPluginExtensions';

import { ExtensionPointErrorMessages } from './ErrorMessages';
import { useAddedComponentsRegistry } from './ExtensionRegistriesContext';
import { ExtensionPointValidator } from './ExtensionsValidator';
import { log } from './logs/log';

// Returns an array of component extensions for the given extension point
export function usePluginComponents<Props extends object = {}>({
  limitPerPlugin,
  extensionPointId,
}: UsePluginComponentOptions): UsePluginComponentsResult<Props> {
  const registry = useAddedComponentsRegistry();
  const registryState = useObservable(registry.asObservable());
  const pluginContext = usePluginContext();

  return useMemo(() => {
    // For backwards compatibility we don't enable restrictions in production or when the hook is used in core Grafana.
    const components: Array<React.ComponentType<Props>> = [];
    const extensionsByPlugin: Record<string, number> = {};
    const pluginId = pluginContext?.meta.id ?? '';
    const validator = new ExtensionPointValidator(pluginId, pluginContext);
    const errors = new ExtensionPointErrorMessages(pluginId);
    const pointLog = log.child({
      pluginId,
      extensionPointId,
    });

    if (validator.isExtensionPointIdInvalid(extensionPointId)) {
      errors.addInvalidIdError();
    }

    if (validator.isExtensionPointMetaInfoMissing(extensionPointId)) {
      errors.addMissingMetaInfoError();
    }

    if (errors.hasErrors) {
      pointLog.error(errors.getLogMessage());
      return {
        isLoading: false,
        components: [],
      };
    }

    for (const registryItem of registryState?.[extensionPointId] ?? []) {
      const { pluginId } = registryItem;

      // Only limit if the `limitPerPlugin` is set
      if (limitPerPlugin && extensionsByPlugin[pluginId] >= limitPerPlugin) {
        continue;
      }

      if (extensionsByPlugin[pluginId] === undefined) {
        extensionsByPlugin[pluginId] = 0;
      }

      components.push(registryItem.component as React.ComponentType<Props>);
      extensionsByPlugin[pluginId] += 1;
    }

    return {
      isLoading: false,
      components,
    };
  }, [extensionPointId, limitPerPlugin, pluginContext, registryState]);
}
