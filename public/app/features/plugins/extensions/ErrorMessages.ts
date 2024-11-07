export abstract class ErrorMessages {
  protected errors: string[];
  constructor(protected pluginId: string) {
    this.errors = [];
  }

  get hasErrors() {
    return this.errors.length > 0;
  }

  abstract getLogMessage(): string;
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
      `The extension was not recorded in the plugin.json. ${this.typeFriendlyName} extensions must be listed in the section "${this.sectionName}".`
    );
  }

  addTitleMismatchError() {
    this.errors.push(`The title of the ${this.typeFriendlyName} does not match the title specified in plugin.json.`);
  }

  addInvalidExtensionTargetsError() {
    this.errors.push(
      `The registered extension point targets does not match the targets listed in the section "${this.sectionName}" of the plugin.json file.`
    );
  }

  addTitleMissingError() {
    this.errors.push('Title is missing.');
  }

  addDescriptionMissingError() {
    this.errors.push('Description is missing.');
  }

  getLogMessage() {
    return `Could not register ${this.typeFriendlyName.toLocaleLowerCase()} extension. Reason${this.errors.length > 1 ? 's' : ''}: \n${this.errors.join('\n')}`;
  }
}

export class AddedLinkErrorMessages extends ExtensionsErrorMessages {
  constructor(pluginId: string) {
    super(pluginId, 'Added link', 'extensions.addedLinks[]');
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
      'The exposed component is not recorded in the "plugin.json" file. Exposed components must be listed in the dependencies[] section.'
    );
  }
}

export class ExtensionPointErrorMessages extends ErrorMessages {
  constructor(pluginId: string) {
    super(pluginId);
  }

  get InvalidIdError() {
    return `Extension point id should be prefixed with your plugin id, e.g "myorg-foo-app/toolbar/v1".`;
  }

  addMissingMetaInfoError() {
    this.errors.push(
      'The extension point is not recorded in the "plugin.json" file. Extension points must be listed in the section "extensions.extensionPoints[]". Returning an empty array of extensions.'
    );
  }

  addInvalidIdError() {
    this.errors.push(this.InvalidIdError);
  }

  getLogMessage() {
    return `Could not use extension point. Reason${this.errors.length > 1 ? 's' : ''}: \n${this.errors.join('\n')}`;
  }
}
