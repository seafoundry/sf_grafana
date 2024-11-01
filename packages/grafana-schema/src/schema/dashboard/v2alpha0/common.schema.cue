package v2alpha0

// --- Common types ---
Kind: {
    kind: string,
    spec: _
    metadata?: _
}

ElementReferenceKind: {
  kind: "ElementReference"
  spec: ElementReferenceSpec
}

ElementReferenceSpec: {
  name: string
}

DataSourceRef: {
  // The plugin type-id
  type?: string

  // Specific datasource instance
  uid?: string
}

// Matcher is a predicate configuration. Based on the config a set of field(s) or values is filtered in order to apply override / transformation.
// It comes with in id ( to resolve implementation from registry) and a configuration that’s specific to a particular matcher type.
MatcherConfig: {
  // The matcher id. This is used to find the matcher implementation from registry.
  id: string | *""
  // The matcher options. This is specific to the matcher implementation.
  options?: _
}
