// Code generated - EDITING IS FUTILE. DO NOT EDIT.
//
// Generated by:
//     kinds/gen.go
// Using jennies:
//     GoResourceTypes
//
// Run 'make gen-cue' from repository root to regenerate.

// Code generated - EDITING IS FUTILE. DO NOT EDIT.

package role

type Spec struct {
	// The role identifier `managed:builtins:editor:permissions`
	Name string `json:"name"`
	// Optional display
	DisplayName *string `json:"displayName,omitempty"`
	// Name of the team.
	GroupName *string `json:"groupName,omitempty"`
	// Role description
	Description *string `json:"description,omitempty"`
	// Do not show this role
	Hidden bool `json:"hidden"`
}
