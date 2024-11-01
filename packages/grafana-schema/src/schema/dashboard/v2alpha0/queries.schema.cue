package v2alpha0

QueryOptionsSpec: {
  timeFrom?: string
  maxDataPoints?: int
  timeShift?: string
  queryCachingTTL?: int
  interval?: string
  cacheTimeout?: string
}

DataQueryKind: {
  kind: string
  spec: [string]: _
}

PanelQuerySpec: {
  query: DataQueryKind
  datasource: DataSourceRef

  refId: string
  hidden: bool
}

PanelQueryKind: {
  kind: "PanelQuery"
  spec: PanelQuerySpec
}

// Transformations allow to manipulate data returned by a query before the system applies a visualization.
// Using transformations you can: rename fields, join time series data, perform mathematical operations across queries,
// use the output of one transformation as the input to another transformation, etc.
DataTransformerConfig: {
  // Unique identifier of transformer
  id: string
  // Disabled transformations are skipped
  disabled?: bool
  // Optional frame matcher. When missing it will be applied to all results
  filter?: MatcherConfig
  // Where to pull DataFrames from as input to transformation
  topic?: "series" | "annotations" | "alertStates" // replaced with DataTopic
  // Options to be passed to the transformer
  // Valid options depend on the transformer id
  options: _
}

TransformationKind: {
  kind: string
  spec: DataTransformerConfig
}

QueryGroupSpec: {
  queries: [...PanelQueryKind]
  transformations: [...TransformationKind]
  queryOptions: QueryOptionsSpec
}

QueryGroupKind: {
  kind: "QueryGroup"
  spec: QueryGroupSpec
}

