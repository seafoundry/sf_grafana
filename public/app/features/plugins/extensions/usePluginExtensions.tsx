import { useMemo } from 'react';
import { useObservable } from 'react-use';

import { PluginExtension, usePluginContext } from '@grafana/data';
import { GetPluginExtensionsOptions, UsePluginExtensionsResult } from '@grafana/runtime';

import { ExtensionPointErrorMessages } from './ErrorMessages';
import { ExtensionPointValidator } from './ExtensionsValidator';
import { getPluginExtensions } from './getPluginExtensions';
import { log } from './logs/log';
import { PluginExtensionRegistries } from './registry/types';

export function createUsePluginExtensions(registries: PluginExtensionRegistries) {
  const observableAddedComponentsRegistry = registries.addedComponentsRegistry.asObservable();
  const observableAddedLinksRegistry = registries.addedLinksRegistry.asObservable();

  return function usePluginExtensions(options: GetPluginExtensionsOptions): UsePluginExtensionsResult<PluginExtension> {
    const pluginContext = usePluginContext();
    const addedComponentsRegistry = useObservable(observableAddedComponentsRegistry);
    const addedLinksRegistry = useObservable(observableAddedLinksRegistry);
    const { extensionPointId, context, limitPerPlugin } = options;

    const { extensions } = useMemo(() => {
      // For backwards compatibility we don't enable restrictions in production or when the hook is used in core Grafana.
      const pluginId = pluginContext?.meta.id ?? '';

      const validator = new ExtensionPointValidator(pluginId, pluginContext);
      const errors = new ExtensionPointErrorMessages(pluginId);
      const pointLog = log.child({
        pluginId,
        extensionPointId,
      });

      if (!addedLinksRegistry && !addedComponentsRegistry) {
        return { extensions: [], isLoading: false };
      }

      if (validator.isExtensionPointIdInvalid(extensionPointId)) {
        pointLog.warning(errors.InvalidIdError);
      }

      if (validator.isExtensionPointMetaInfoMissing(extensionPointId)) {
        errors.addMissingMetaInfoError();
      }

      if (errors.hasErrors) {
        pointLog.error(errors.getLogMessage());
        return {
          isLoading: false,
          extensions: [],
        };
      }

      return getPluginExtensions({
        extensionPointId,
        context,
        limitPerPlugin,
        addedComponentsRegistry,
        addedLinksRegistry,
      });
      // Doing the deps like this instead of just `option` because users probably aren't going to memoize the
      // options object so we are checking it's simple value attributes.
      // The context though still has to be memoized though and not mutated.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO: refactor `getPluginExtensions` to accept service dependencies as arguments instead of relying on the sidecar singleton under the hood
    }, [addedLinksRegistry, addedComponentsRegistry, extensionPointId, context, limitPerPlugin, pluginContext]);

    return { extensions, isLoading: false };
  };
}
