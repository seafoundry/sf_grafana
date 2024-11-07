import { isString } from 'lodash';
import { useMemo } from 'react';
import { useObservable } from 'react-use';

import { PluginExtensionLink, PluginExtensionTypes, usePluginContext } from '@grafana/data';
import {
  UsePluginLinksOptions,
  UsePluginLinksResult,
} from '@grafana/runtime/src/services/pluginExtensions/getPluginExtensions';

import { useAddedLinksRegistry } from './ExtensionRegistriesContext';
import { ExtensionPointErrorMessages } from './ExtensionsErrorMessages';
import { ExtensionPointValidator } from './ExtensionsValidator';
import { log } from './logs/log';
import {
  generateExtensionId,
  getLinkExtensionOnClick,
  getLinkExtensionOverrides,
  getLinkExtensionPathWithTracking,
  getReadOnlyProxy,
} from './utils';

// Returns an array of component extensions for the given extension point
export function usePluginLinks({
  limitPerPlugin,
  extensionPointId,
  context,
}: UsePluginLinksOptions): UsePluginLinksResult {
  const registry = useAddedLinksRegistry();
  const pluginContext = usePluginContext();
  const registryState = useObservable(registry.asObservable());

  return useMemo(() => {
    // For backwards compatibility we don't enable restrictions in production or when the hook is used in core Grafana.
    const pluginId = pluginContext?.meta.id ?? '';
    const validator = new ExtensionPointValidator(pluginId, pluginContext);
    const errors = new ExtensionPointErrorMessages(pluginId);
    const pointLog = log.child({
      pluginId,
      extensionPointId,
    });

    if (validator.isExtensionPointIdInvalid(extensionPointId)) {
      errors.addInvalidIdError(extensionPointId);
    }

    if (validator.isExtensionPointMetaInfoMissing(extensionPointId)) {
      errors.addMissingMetaInfoError();
    }

    if (errors.hasErrors) {
      pointLog.error(errors.getLogMessage());
      return {
        isLoading: false,
        links: [],
      };
    }

    if (!registryState || !registryState[extensionPointId]) {
      return {
        isLoading: false,
        links: [],
      };
    }

    const frozenContext = context ? getReadOnlyProxy(context) : {};
    const extensions: PluginExtensionLink[] = [];
    const extensionsByPlugin: Record<string, number> = {};

    for (const addedLink of registryState[extensionPointId] ?? []) {
      const { pluginId } = addedLink;
      // Only limit if the `limitPerPlugin` is set
      if (limitPerPlugin && extensionsByPlugin[pluginId] >= limitPerPlugin) {
        pointLog.debug(`The limit of ${limitPerPlugin} links per plugin has been reached. Skipping the rest.`);
        continue;
      }

      if (extensionsByPlugin[pluginId] === undefined) {
        extensionsByPlugin[pluginId] = 0;
      }

      const linkLog = pointLog.child({
        path: addedLink.path ?? '',
        title: addedLink.title,
        description: addedLink.description,
        onClick: typeof addedLink.onClick,
      });
      // Run the configure() function with the current context, and apply the ovverides
      const overrides = getLinkExtensionOverrides(pluginId, addedLink, linkLog, frozenContext);

      // configure() returned an `undefined` -> hide the extension
      if (addedLink.configure && overrides === undefined) {
        continue;
      }

      const path = overrides?.path || addedLink.path;
      const extension: PluginExtensionLink = {
        id: generateExtensionId(pluginId, extensionPointId, addedLink.title),
        type: PluginExtensionTypes.link,
        pluginId: pluginId,
        onClick: getLinkExtensionOnClick(pluginId, extensionPointId, addedLink, linkLog, frozenContext),

        // Configurable properties
        icon: overrides?.icon || addedLink.icon,
        title: overrides?.title || addedLink.title,
        description: overrides?.description || addedLink.description,
        path: isString(path) ? getLinkExtensionPathWithTracking(pluginId, path, extensionPointId) : undefined,
        category: overrides?.category || addedLink.category,
      };

      extensions.push(extension);
      extensionsByPlugin[pluginId] += 1;
    }

    return {
      isLoading: false,
      links: extensions,
    };
  }, [context, extensionPointId, limitPerPlugin, registryState, pluginContext]);
}
