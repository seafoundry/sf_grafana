package permissions

import (
	"fmt"
	"strings"

	"github.com/grafana/grafana/pkg/services/accesscontrol"
	"github.com/grafana/grafana/pkg/services/dashboards"
	"github.com/grafana/grafana/pkg/services/featuremgmt"
	"github.com/grafana/grafana/pkg/services/folder"
	"github.com/grafana/grafana/pkg/services/login"
)

type accessControlDashboardPermissionFilterNoFolderSubquery struct {
	accessControlDashboardPermissionFilter

	folderIsRequired bool
}

func (f *accessControlDashboardPermissionFilterNoFolderSubquery) LeftJoin() string {
	if !f.folderIsRequired {
		return ""
	}
	return " dashboard AS folder ON dashboard.org_id = folder.org_id AND dashboard.folder_id = folder.id"
}

func (f *accessControlDashboardPermissionFilterNoFolderSubquery) buildClauses() {
	if f.user == nil || f.user.Permissions == nil || f.user.Permissions[f.user.OrgID] == nil {
		f.where = clause{string: "(1 = 0)"}
		return
	}
	dashWildcards := accesscontrol.WildcardsFromPrefix(dashboards.ScopeDashboardsPrefix)
	folderWildcards := accesscontrol.WildcardsFromPrefix(dashboards.ScopeFoldersPrefix)

	filter, params := accesscontrol.UserRolesFilter(f.user.OrgID, f.user.UserID, f.user.Teams, accesscontrol.GetOrgRoles(f.user))
	rolesFilter := " AND role_id IN(SELECT id FROM role " + filter + ") "
	var args []any
	builder := strings.Builder{}
	builder.WriteRune('(')

	permSelector := strings.Builder{}
	var permSelectorArgs []any

	// useSelfContainedPermissions is true if the user's permissions are stored and set from the JWT token
	// currently it's used for the extended JWT module (when the user is authenticated via a JWT token generated by Grafana)
	useSelfContainedPermissions := f.user.AuthenticatedBy == login.ExtendedJWTModule

	if len(f.dashboardActions) > 0 {
		toCheck := actionsToCheck(f.dashboardActions, f.user.Permissions[f.user.OrgID], dashWildcards, folderWildcards)

		if len(toCheck) > 0 {
			if !useSelfContainedPermissions {
				builder.WriteString("(dashboard.uid IN (SELECT substr(scope, 16) FROM permission WHERE scope LIKE 'dashboards:uid:%'")
				builder.WriteString(rolesFilter)
				args = append(args, params...)

				if len(toCheck) == 1 {
					builder.WriteString(" AND action = ?")
					args = append(args, toCheck[0])
				} else {
					builder.WriteString(" AND action IN (?" + strings.Repeat(", ?", len(toCheck)-1) + ") GROUP BY role_id, scope HAVING COUNT(action) = ?")
					args = append(args, toCheck...)
					args = append(args, len(toCheck))
				}
				builder.WriteString(") AND NOT dashboard.is_folder)")
			} else {
				actions := parseStringSliceFromInterfaceSlice(toCheck)

				args = getAllowedUIDs(actions, f.user, dashboards.ScopeDashboardsPrefix)

				// Only add the IN clause if we have any dashboards to check
				if len(args) > 0 {
					builder.WriteString("(dashboard.uid IN (?" + strings.Repeat(", ?", len(args)-1) + "")
					builder.WriteString(") AND NOT dashboard.is_folder)")
				} else {
					builder.WriteString("(1 = 0)")
				}
			}

			builder.WriteString(" OR ")

			if !useSelfContainedPermissions {
				permSelector.WriteString("(SELECT substr(scope, 13) FROM permission WHERE scope LIKE 'folders:uid:%' ")
				permSelector.WriteString(rolesFilter)
				permSelectorArgs = append(permSelectorArgs, params...)

				if len(toCheck) == 1 {
					permSelector.WriteString(" AND action = ?")
					permSelectorArgs = append(permSelectorArgs, toCheck[0])
				} else {
					permSelector.WriteString(" AND action IN (?" + strings.Repeat(", ?", len(toCheck)-1) + ") GROUP BY role_id, scope HAVING COUNT(action) = ?")
					permSelectorArgs = append(permSelectorArgs, toCheck...)
					permSelectorArgs = append(permSelectorArgs, len(toCheck))
				}
			} else {
				actions := parseStringSliceFromInterfaceSlice(toCheck)

				permSelectorArgs = getAllowedUIDs(actions, f.user, dashboards.ScopeFoldersPrefix)

				// Only add the IN clause if we have any folders to check
				if len(permSelectorArgs) > 0 {
					permSelector.WriteString("(?" + strings.Repeat(", ?", len(permSelectorArgs)-1) + "")
				} else {
					permSelector.WriteString("(")
				}
			}

			permSelector.WriteRune(')')

			switch f.features.IsEnabled(featuremgmt.FlagNestedFolders) {
			case true:
				if len(permSelectorArgs) > 0 {
					switch f.recursiveQueriesAreSupported {
					case true:
						recQueryName := fmt.Sprintf("RecQry%d", len(f.recQueries))
						f.addRecQry(recQueryName, permSelector.String(), permSelectorArgs)
						builder.WriteString("(folder.uid IN (SELECT uid FROM " + recQueryName)
					default:
						nestedFoldersSelectors, nestedFoldersArgs := f.nestedFoldersSelectors(permSelector.String(), permSelectorArgs, "folder.uid", "")
						builder.WriteRune('(')
						builder.WriteString(nestedFoldersSelectors)
						args = append(args, nestedFoldersArgs...)
					}
					f.folderIsRequired = true
					builder.WriteString(") AND NOT dashboard.is_folder)")
				} else {
					builder.WriteString("( 1 = 0 AND NOT dashboard.is_folder)")
				}
			default:
				builder.WriteString("(")
				if len(permSelectorArgs) > 0 {
					builder.WriteString("folder.uid IN ")
					builder.WriteString(permSelector.String())
					args = append(args, permSelectorArgs...)
					f.folderIsRequired = true
				} else {
					builder.WriteString("1 = 0 ")
				}
				builder.WriteString(" AND NOT dashboard.is_folder)")
			}
		} else {
			builder.WriteString("NOT dashboard.is_folder")
		}
	}

	// recycle and reuse
	permSelector.Reset()
	permSelectorArgs = permSelectorArgs[:0]

	if len(f.folderActions) > 0 {
		if len(f.dashboardActions) > 0 {
			builder.WriteString(" OR ")
		}

		toCheck := actionsToCheck(f.folderActions, f.user.Permissions[f.user.OrgID], folderWildcards)
		if len(toCheck) > 0 {
			if !useSelfContainedPermissions {
				permSelector.WriteString("(SELECT substr(scope, 13) FROM permission WHERE scope LIKE 'folders:uid:%'")
				permSelector.WriteString(rolesFilter)
				permSelectorArgs = append(permSelectorArgs, params...)
				if len(toCheck) == 1 {
					permSelector.WriteString(" AND action = ?")
					permSelectorArgs = append(permSelectorArgs, toCheck[0])
				} else {
					permSelector.WriteString(" AND action IN (?" + strings.Repeat(", ?", len(toCheck)-1) + ") GROUP BY role_id, scope HAVING COUNT(action) = ?")
					permSelectorArgs = append(permSelectorArgs, toCheck...)
					permSelectorArgs = append(permSelectorArgs, len(toCheck))
				}
			} else {
				actions := parseStringSliceFromInterfaceSlice(toCheck)

				permSelectorArgs = getAllowedUIDs(actions, f.user, dashboards.ScopeFoldersPrefix)

				if len(permSelectorArgs) > 0 {
					permSelector.WriteString("(?" + strings.Repeat(", ?", len(permSelectorArgs)-1) + "")
				} else {
					permSelector.WriteString("(")
				}
			}
			permSelector.WriteRune(')')

			switch f.features.IsEnabled(featuremgmt.FlagNestedFolders) {
			case true:
				if len(permSelectorArgs) > 0 {
					switch f.recursiveQueriesAreSupported {
					case true:
						recQueryName := fmt.Sprintf("RecQry%d", len(f.recQueries))
						f.addRecQry(recQueryName, permSelector.String(), permSelectorArgs)
						builder.WriteString("(dashboard.uid IN ")
						builder.WriteString(fmt.Sprintf("(SELECT uid FROM %s)", recQueryName))
					default:
						nestedFoldersSelectors, nestedFoldersArgs := f.nestedFoldersSelectors(permSelector.String(), permSelectorArgs, "dashboard.uid", "")
						builder.WriteRune('(')
						builder.WriteString(nestedFoldersSelectors)
						builder.WriteRune(')')
						args = append(args, nestedFoldersArgs...)
					}
				} else {
					builder.WriteString("(1 = 0")
				}
			default:
				if len(permSelectorArgs) > 0 {
					builder.WriteString("(dashboard.uid IN ")
					builder.WriteString(permSelector.String())
					args = append(args, permSelectorArgs...)
				} else {
					builder.WriteString("(1 = 0")
				}
			}
			builder.WriteString(" AND dashboard.is_folder)")
		} else {
			builder.WriteString("dashboard.is_folder")
		}
	}
	builder.WriteRune(')')

	f.where = clause{string: builder.String(), params: args}
}

func (f *accessControlDashboardPermissionFilterNoFolderSubquery) nestedFoldersSelectors(permSelector string, permSelectorArgs []any, leftTableCol string, _ string) (string, []any) {
	wheres := make([]string, 0, folder.MaxNestedFolderDepth+1)
	args := make([]any, 0, len(permSelectorArgs)*(folder.MaxNestedFolderDepth+1))

	joins := make([]string, 0, folder.MaxNestedFolderDepth+2)

	tmpl := "INNER JOIN folder %s ON %s.parent_uid = %s.uid AND %s.org_id = %s.org_id "

	wheres = append(wheres, fmt.Sprintf("(%s IN (SELECT f1.uid FROM folder f1 WHERE f1.uid IN %s)", leftTableCol, permSelector))
	args = append(args, permSelectorArgs...)

	prev := "f1"
	for i := 2; i <= folder.MaxNestedFolderDepth+2; i++ {
		t := fmt.Sprintf("f%d", i)
		s := fmt.Sprintf(tmpl, t, prev, t, prev, t)
		joins = append(joins, s)

		wheres = append(wheres, fmt.Sprintf("(%s IN (SELECT f1.uid FROM folder f1 %s WHERE %s.uid IN %s)", leftTableCol, strings.Join(joins, " "), t, permSelector))
		args = append(args, permSelectorArgs...)

		prev = t
	}

	return strings.Join(wheres, ") OR "), args
}
