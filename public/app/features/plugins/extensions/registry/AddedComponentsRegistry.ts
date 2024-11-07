import { ReplaySubject } from 'rxjs';

import { PluginExtensionAddedComponentConfig } from '@grafana/data';

import { AddedComponentLogMessage } from '../ErrorMessages';
import { ExtensionsValidator } from '../ExtensionsValidator';
import { isGrafanaDevMode, wrapWithPluginContext } from '../utils';
import { extensionPointEndsWithVersion, isGrafanaCoreExtensionPoint } from '../validators';

import { PluginExtensionConfigs, Registry, RegistryType } from './Registry';

export type AddedComponentRegistryItem<Props = {}> = {
  pluginId: string;
  title: string;
  description: string;
  component: React.ComponentType<Props>;
};

export class AddedComponentsRegistry extends Registry<
  AddedComponentRegistryItem[],
  PluginExtensionAddedComponentConfig
> {
  constructor(
    options: {
      registrySubject?: ReplaySubject<RegistryType<AddedComponentRegistryItem[]>>;
      initialState?: RegistryType<AddedComponentRegistryItem[]>;
    } = {}
  ) {
    super(options);
  }

  mapToRegistry(
    registry: RegistryType<AddedComponentRegistryItem[]>,
    item: PluginExtensionConfigs<PluginExtensionAddedComponentConfig>
  ): RegistryType<AddedComponentRegistryItem[]> {
    const { pluginId, configs } = item;

    for (const config of configs) {
      const enableRestrictions = isGrafanaDevMode() && pluginId !== 'grafana';
      const metaValidator = new ExtensionsValidator(pluginId);
      const configLog = this.logger.child({
        description: config.description,
        title: config.title,
        pluginId,
      });

      const msg = new AddedComponentLogMessage(configLog, pluginId);
      if (!config.title) {
        msg.addTitleMissingError();
      }

      if (!config.description) {
        msg.addDescriptionMissingError();
      }

      if (metaValidator.isAddedComponentMetaMissing(config)) {
        enableRestrictions ? msg.addMissingExtensionMetaError() : msg.addMissingExtensionMetaWarning();
      }

      if (metaValidator.isAddedComponentTargetsNotMatching(config)) {
        enableRestrictions ? msg.addInvalidExtensionTargetsError() : msg.addInvalidExtensionTargetsWarning();
      }

      const extensionPointIds = Array.isArray(config.targets) ? config.targets : [config.targets];
      for (const extensionPointId of extensionPointIds) {
        const pointIdLog = configLog.child({ extensionPointId });

        if (!isGrafanaCoreExtensionPoint(extensionPointId) && !extensionPointEndsWithVersion(extensionPointId)) {
          msg.addMissingVersionSuffixWarning();
        }

        const result = {
          pluginId,
          component: wrapWithPluginContext(pluginId, config.component, pointIdLog),
          description: config.description,
          title: config.title,
        };

        if (!(extensionPointId in registry)) {
          registry[extensionPointId] = [result];
        } else {
          registry[extensionPointId].push(result);
        }
      }
      msg.print();
    }

    return registry;
  }

  // Returns a read-only version of the registry.
  readOnly() {
    return new AddedComponentsRegistry({
      registrySubject: this.registrySubject,
    });
  }
}
