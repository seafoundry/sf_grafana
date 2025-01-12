package apiregistry

import (
	"github.com/grafana/grafana/pkg/registry/apis/alerting/notifications"
	"github.com/grafana/grafana/pkg/registry/apis/dashboard"
	"github.com/grafana/grafana/pkg/registry/apis/dashboardsnapshot"
	"github.com/grafana/grafana/pkg/registry/apis/datasource"
	"github.com/grafana/grafana/pkg/registry/apis/featuretoggle"
	"github.com/grafana/grafana/pkg/registry/apis/folders"
	"github.com/grafana/grafana/pkg/registry/apis/iam"
	"github.com/grafana/grafana/pkg/registry/apis/peakq"
	"github.com/grafana/grafana/pkg/registry/apis/query"
	"github.com/grafana/grafana/pkg/registry/apis/scope"
	"github.com/grafana/grafana/pkg/registry/apis/search"
)

type Service struct{}

// ProvideRegistryServiceSink is an entry point for each service that will force initialization
// and give each builder the chance to register itself with the main server
func ProvideRegistryServiceSink(
	_ *dashboard.DashboardsAPIBuilder,
	_ *dashboardsnapshot.SnapshotsAPIBuilder,
	_ *featuretoggle.FeatureFlagAPIBuilder,
	_ *datasource.DataSourceAPIBuilder,
	_ *folders.FolderAPIBuilder,
	_ *peakq.PeakQAPIBuilder,
	_ *iam.IdentityAccessManagementAPIBuilder,
	_ *scope.ScopeAPIBuilder,
	_ *query.QueryAPIBuilder,
	_ *notifications.NotificationsAPIBuilder,
	_ *search.SearchAPIBuilder,
) *Service {
	return &Service{}
}
