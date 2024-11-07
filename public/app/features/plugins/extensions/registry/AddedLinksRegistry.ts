import { ReplaySubject } from 'rxjs';

import { IconName, PluginExtensionAddedLinkConfig } from '@grafana/data';
import { PluginAddedLinksConfigureFunc, PluginExtensionEventHelpers } from '@grafana/data/src/types/pluginExtensions';

import { AddedLinkLogMessage } from '../ErrorMessages';
import { ExtensionsValidator } from '../ExtensionsValidator';
import { isGrafanaDevMode } from '../utils';
import {
  extensionPointEndsWithVersion,
  isConfigureFnValid,
  isGrafanaCoreExtensionPoint,
  isLinkPathValid,
} from '../validators';

import { PluginExtensionConfigs, Registry, RegistryType } from './Registry';

export type AddedLinkRegistryItem<Context extends object = object> = {
  pluginId: string;
  extensionPointId: string;
  title: string;
  description: string;
  path?: string;
  onClick?: (event: React.MouseEvent | undefined, helpers: PluginExtensionEventHelpers<Context>) => void;
  configure?: PluginAddedLinksConfigureFunc<Context>;
  icon?: IconName;
  category?: string;
};

export class AddedLinksRegistry extends Registry<AddedLinkRegistryItem[], PluginExtensionAddedLinkConfig> {
  constructor(
    options: {
      registrySubject?: ReplaySubject<RegistryType<AddedLinkRegistryItem[]>>;
      initialState?: RegistryType<AddedLinkRegistryItem[]>;
    } = {}
  ) {
    super(options);
  }

  mapToRegistry(
    registry: RegistryType<AddedLinkRegistryItem[]>,
    item: PluginExtensionConfigs<PluginExtensionAddedLinkConfig>
  ): RegistryType<AddedLinkRegistryItem[]> {
    const { pluginId, configs } = item;

    for (const config of configs) {
      const { path, title, description, configure, onClick, targets } = config;
      const configLog = this.logger.child({
        path: path ?? '',
        description,
        title,
        pluginId,
        onClick: typeof onClick,
      });
      const enableRestrictions = isGrafanaDevMode() && pluginId !== 'grafana';
      const metaValidator = new ExtensionsValidator(pluginId);
      const msg = new AddedLinkLogMessage(configLog, pluginId);

      if (!title) {
        msg.addTitleMissingError();
      }

      if (!description) {
        msg.addDescriptionMissingError();
      }

      if (!isConfigureFnValid(configure)) {
        msg.addInvalidConfigureFnError();
      }

      if (!path && !onClick) {
        msg.addInvalidPathOrOnClickError();
      }

      if (path && !isLinkPathValid(pluginId, path)) {
        msg.addInvalidLinkPathError();
      }

      if (metaValidator.isAddedLinkMetaMissing(config)) {
        enableRestrictions ? msg.addMissingExtensionMetaError() : msg.addMissingExtensionMetaWarning();
      }

      if (metaValidator.isAddedLinkTargetsNotMatching(config)) {
        enableRestrictions ? msg.addInvalidExtensionTargetsError() : msg.addInvalidExtensionTargetsWarning();
      }

      const extensionPointIds = Array.isArray(targets) ? targets : [targets];
      for (const extensionPointId of extensionPointIds) {
        if (!isGrafanaCoreExtensionPoint(extensionPointId) && !extensionPointEndsWithVersion(extensionPointId)) {
          msg.addMissingVersionSuffixWarning();
        }

        const { targets, ...registryItem } = config;

        if (!(extensionPointId in registry)) {
          registry[extensionPointId] = [];
        }

        registry[extensionPointId].push({ ...registryItem, pluginId, extensionPointId });
      }
      msg.print();
    }

    return registry;
  }

  // Returns a read-only version of the registry.
  readOnly() {
    return new AddedLinksRegistry({
      registrySubject: this.registrySubject,
    });
  }
}
