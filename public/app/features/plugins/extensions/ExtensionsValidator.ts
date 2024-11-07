import { PluginContextType } from '@grafana/data';
import {
  PluginExtensionAddedComponentConfig,
  PluginExtensionAddedLinkConfig,
  PluginExtensionExposedComponentConfig,
} from '@grafana/data/src/types/pluginExtensions';
import { AppPluginConfig, config } from '@grafana/runtime';

import { isGrafanaDevMode } from './utils';

export class Validator {
  config?: AppPluginConfig;

  constructor(protected pluginId: string) {
    this.config = config.apps[pluginId];
  }

  isExtensionPointIdInvalid(extensionPointId: string): boolean {
    return !Boolean(
      extensionPointId.startsWith('grafana/') ||
        extensionPointId.startsWith(`plugins/${this.pluginId}/`) ||
        extensionPointId.startsWith(`${this.pluginId}/`)
    );
  }
}

export class ExtensionPointValidator extends Validator {
  enableRestrictions: boolean;
  constructor(
    pluginId: string,
    private pluginContext: PluginContextType | null
  ) {
    super(pluginId);
    this.enableRestrictions = isGrafanaDevMode() && pluginContext !== null;
  }

  isExtensionPointIdInvalid(extensionPointId: string): boolean {
    return this.enableRestrictions && super.isExtensionPointIdInvalid(extensionPointId);
  }

  isExtensionPointMetaInfoMissing(extensionPointId: string): boolean {
    const extensionPoints = this.pluginContext?.meta?.extensions?.extensionPoints;
    return this.enableRestrictions && (!extensionPoints || !extensionPoints.some((ep) => ep.id === extensionPointId));
  }

  isExposedComponentDependencyMissing(id: string): boolean {
    const exposedComponentsDependencies = this.pluginContext?.meta?.dependencies?.extensions?.exposedComponents;
    return this.enableRestrictions && (!exposedComponentsDependencies || !exposedComponentsDependencies.includes(id));
  }
}

export class ExtensionsValidator extends Validator {
  enableRestrictions: boolean;
  constructor(pluginId: string) {
    super(pluginId);
    this.enableRestrictions = isGrafanaDevMode() && this.pluginId !== 'grafana';
  }

  isAddedComponentMetaMissing(extension: PluginExtensionAddedComponentConfig): boolean {
    return (
      this.enableRestrictions &&
      !!!this.config?.extensions.addedComponents.some(({ title }) => title === extension.title)
    );
  }

  isAddedComponentTargetsNotMatching(extension: PluginExtensionAddedLinkConfig): boolean {
    const pluginJsonMeta = this.config?.extensions.addedComponents.find(({ title }) => title === extension.title);
    const targets = Array.isArray(extension.targets) ? extension.targets : [extension.targets];
    return this.enableRestrictions && !targets.every((target) => pluginJsonMeta?.targets.includes(target));
  }

  isExposedComponentMetaMissing(extension: PluginExtensionExposedComponentConfig): boolean {
    return (
      this.enableRestrictions &&
      !!!this.config?.extensions.exposedComponents.some(({ title }) => title === extension.title)
    );
  }

  isExposedComponentTitlesNotMatching(extension: PluginExtensionExposedComponentConfig): boolean {
    const pluginJsonMeta = this.config?.extensions.exposedComponents.find(({ title }) => title === extension.title);
    return this.enableRestrictions && pluginJsonMeta?.title !== extension.title;
  }

  isAddedLinkMetaMissing(extension: PluginExtensionAddedLinkConfig): boolean {
    return (
      this.enableRestrictions && !!!this.config?.extensions.addedLinks.some(({ title }) => title === extension.title)
    );
  }

  isAddedLinkTargetsNotMatching(extension: PluginExtensionAddedLinkConfig): boolean {
    const pluginJsonMeta = this.config?.extensions.addedLinks.find(({ title }) => title === extension.title);
    const targets = Array.isArray(extension.targets) ? extension.targets : [extension.targets];
    return this.enableRestrictions && !targets.every((target) => pluginJsonMeta?.targets.includes(target));
  }
}
