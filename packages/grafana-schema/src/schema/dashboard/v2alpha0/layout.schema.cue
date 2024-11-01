package v2alpha0

GridLayoutItemSpec: {
  x: int
  y: int
  width: int
  height: int
  element: ElementReferenceKind // reference to a PanelKind from dashboard.spec.elements Expressed as JSON Schema reference
}

GridLayoutItemKind: {
  kind: "GridLayoutItem"
  spec: GridLayoutItemSpec
}

GridLayoutSpec: {
  items: [...GridLayoutItemKind]
}

GridLayoutKind: {
  kind: "GridLayout"
  spec: GridLayoutSpec
}
