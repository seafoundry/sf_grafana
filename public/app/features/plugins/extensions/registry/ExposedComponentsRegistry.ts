import { ReplaySubject } from 'rxjs';

import { PluginExtensionExposedComponentConfig } from '@grafana/data';

import { ExposedComponentLogMessage } from '../ErrorMessages';
import { ExtensionsValidator } from '../ExtensionsValidator';
import { extensionPointEndsWithVersion } from '../validators';

import { Registry, RegistryType, PluginExtensionConfigs } from './Registry';

export type ExposedComponentRegistryItem<Props = {}> = {
  pluginId: string;
  title: string;
  description: string;
  component: React.ComponentType<Props>;
};

export class ExposedComponentsRegistry extends Registry<
  ExposedComponentRegistryItem,
  PluginExtensionExposedComponentConfig
> {
  constructor(
    options: {
      registrySubject?: ReplaySubject<RegistryType<ExposedComponentRegistryItem>>;
      initialState?: RegistryType<ExposedComponentRegistryItem>;
    } = {}
  ) {
    super(options);
  }

  mapToRegistry(
    registry: RegistryType<ExposedComponentRegistryItem>,
    { pluginId, configs }: PluginExtensionConfigs<PluginExtensionExposedComponentConfig>
  ): RegistryType<ExposedComponentRegistryItem> {
    if (!configs) {
      return registry;
    }

    for (const config of configs) {
      const metaValidator = new ExtensionsValidator(pluginId);
      const errors = new ExposedComponentLogMessage(pluginId);
      const { id, description, title } = config;
      const pointIdLog = this.logger.child({
        extensionPointId: id,
        description,
        title,
        pluginId,
      });

      if (!id.startsWith(pluginId)) {
        errors.addInvalidComponentIdError();
      }

      if (!extensionPointEndsWithVersion(id)) {
        pointIdLog.warning(
          `Exposed component does not match the convention. It's recommended to suffix the id with the component version. e.g 'myorg-basic-app/my-component-id/v1'.`
        );
      }

      if (registry[id]) {
        errors.addComponentAlreadyExistsError();
      }

      if (!title) {
        errors.addTitleMissingError();
      }

      if (!description) {
        errors.addDescriptionMissingError();
      }

      if (metaValidator.isExposedComponentMetaMissing(config)) {
        errors.addMissingExtensionMetaError();
      }

      if (metaValidator.isExposedComponentTitlesNotMatching(config)) {
        errors.addTitleMismatchError();
      }

      // if (errors.hasItems) {
      //   pointIdLog.error(errors.getLogMessage());
      //   continue;
      // }

      pointIdLog.debug(`Exposed component extension successfully registered.`);

      registry[id] = { ...config, pluginId };
    }

    return registry;
  }

  // Returns a read-only version of the registry.
  readOnly() {
    return new ExposedComponentsRegistry({
      registrySubject: this.registrySubject,
    });
  }
}
