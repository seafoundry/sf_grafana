export enum ExtensionsType {
  AddedComponents = 'addedComponents',
  AddedLinks = 'addedLinks',
  ExposedComponents = 'exposedComponents',
}

export abstract class ErrorMessages {
  protected errors: string[];
  constructor(protected pluginId: string) {
    this.errors = [];
  }

  get hasErrors() {
    return this.errors.length > 0;
  }
}

abstract class ExtensionsErrorMessages extends ErrorMessages {
  constructor(
    pluginId: string,
    private typeFriendlyName: string,
    private sectionName: string
  ) {
    super(pluginId);
  }

  addMissingExtensionMetaError() {
    this.errors.push(
      `The extension was not declared in the plugin.json of "${this.pluginId}". ${this.typeFriendlyName} extensions must be listed in the section "${this.sectionName}".`
    );
  }

  addTitleMismatchError() {
    this.errors.push(
      `The title of the ${this.typeFriendlyName} does not match the title specified in the plugin.json file.`
    );
  }

  addInvalidExtensionTargetsError() {
    this.errors.push('The "targets" property is missing in the component configuration.');
  }

  addTitleMissingError() {
    this.errors.push('Title is missing.');
  }

  addDescriptionMissingError() {
    this.errors.push('Description is missing.');
  }

  getLogMessage() {
    return `Could not register ${this.typeFriendlyName.toLocaleLowerCase()} extension. Reasons: \n${this.errors.join('\n')}`;
  }
}

export class AddedLinkErrorMessages extends ExtensionsErrorMessages {
  constructor(pluginId: string) {
    super(pluginId, 'Added link', 'extensions.addedLinks[]');
  }

  addInvalidExtensionTargetsError() {
    this.errors.push('The "targets" property is missing in the link configuration.');
  }

  addInvalidConfigureFnError() {
    this.errors.push('Invalid "configure" function. It should be a function.');
  }

  addInvalidPathOrOnClickError() {
    this.errors.push('You need to provide either "path" or "onClick".');
  }

  addInvalidLinkPathError() {
    this.errors.push('The "path" is required and should start with "/a/{pluginId}/".');
  }
}

export class AddedComponentErrorMessages extends ExtensionsErrorMessages {
  constructor(pluginId: string) {
    super(pluginId, 'Added component', 'extensions.addedComponents[]');
  }
}

export class ExposedComponentErrorMessages extends ExtensionsErrorMessages {
  constructor(pluginId: string) {
    super(pluginId, 'Exposed component', 'extensions.exposedComponents[]');
  }

  addInvalidComponentIdError() {
    this.errors.push(
      "The component id does not match the id naming convention. Id should be prefixed with plugin id. e.g 'myorg-basic-app/my-component-id/v1'."
    );
  }

  addComponentAlreadyExistsError() {
    this.errors.push('An exposed component with the same id already exists.');
  }

  addMissingDependencyInfoError() {
    this.errors.push(
      'The exposed component is not declared in the "plugin.json" file. Exposed components must be listed in the dependencies[] section.'
    );
  }
}

export class ExtensionPointErrorMessages extends ErrorMessages {
  constructor(pluginId: string) {
    super(pluginId);
  }

  get InvalidIdError() {
    return `Extension point id should be prefixed with your plugin id, e.g "${this.pluginId}/{extensionPointId}".`;
  }

  addMissingMetaInfoError() {
    this.errors.push(
      'Invalid extension point. Reason: The extension point is not declared in the "plugin.json" file. Extension points must be listed in the section "extensions.extensionPoints[]". Returning an empty array of extensions.'
    );
  }

  addInvalidIdError(extensionPointId: string) {
    this.errors.push(this.InvalidIdError);
  }

  getLogMessage() {
    return `Could not register extension point. Reasons: \n${this.errors.join('\n')}`;
  }
}
