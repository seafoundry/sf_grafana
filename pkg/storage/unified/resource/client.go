package resource

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"time"

	"github.com/fullstorydev/grpchan"
	"github.com/fullstorydev/grpchan/inprocgrpc"
	"github.com/go-jose/go-jose/v3"
	"github.com/go-jose/go-jose/v3/jwt"
	authnlib "github.com/grafana/authlib/authn"
	authzlib "github.com/grafana/authlib/authz"
	"github.com/grafana/authlib/claims"
	grpcAuth "github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/auth"
	"google.golang.org/grpc"

	"github.com/grafana/grafana/pkg/apimachinery/identity"
	"github.com/grafana/grafana/pkg/services/auth"
	"github.com/grafana/grafana/pkg/services/authn/grpcutils"
	"github.com/grafana/grafana/pkg/setting"
)

// TODO(drclau): decide on the audience for the resource store
const resourceStoreAudience = "resourceStore"

type ResourceClient interface {
	ResourceStoreClient
	ResourceIndexClient
	DiagnosticsClient
}

// Internal implementation
type resourceClient struct {
	ResourceStoreClient
	ResourceIndexClient
	DiagnosticsClient
}

func NewLocalResourceClient(server ResourceServer) ResourceClient {
	// scenario: local in-proc
	channel := &inprocgrpc.Channel{}

	grpcAuthInt := grpcutils.NewInProcGrpcAuthenticator()
	for _, desc := range []*grpc.ServiceDesc{
		&ResourceStore_ServiceDesc,
		&ResourceIndex_ServiceDesc,
		&Diagnostics_ServiceDesc,
	} {
		channel.RegisterService(
			grpchan.InterceptServer(
				desc,
				grpcAuth.UnaryServerInterceptor(grpcAuthInt.Authenticate),
				grpcAuth.StreamServerInterceptor(grpcAuthInt.Authenticate),
			),
			server,
		)
	}

	clientInt, _ := authnlib.NewGrpcClientInterceptor(
		&authnlib.GrpcClientConfig{},
		authnlib.WithDisableAccessTokenOption(),
		authnlib.WithIDTokenExtractorOption(idTokenExtractor),
	)

	cc := grpchan.InterceptClientConn(channel, clientInt.UnaryClientInterceptor, clientInt.StreamClientInterceptor)
	return &resourceClient{
		ResourceStoreClient: NewResourceStoreClient(cc),
		ResourceIndexClient: NewResourceIndexClient(cc),
		DiagnosticsClient:   NewDiagnosticsClient(cc),
	}
}

func NewGRPCResourceClient(conn *grpc.ClientConn) (ResourceClient, error) {
	// scenario: remote on-prem
	clientInt, err := authnlib.NewGrpcClientInterceptor(
		&authnlib.GrpcClientConfig{},
		authnlib.WithDisableAccessTokenOption(),
		authnlib.WithIDTokenExtractorOption(idTokenExtractor),
		authnlib.WithMetadataExtractorOption(namespaceExtractor),
	)
	if err != nil {
		return nil, err
	}

	cc := grpchan.InterceptClientConn(conn, clientInt.UnaryClientInterceptor, clientInt.StreamClientInterceptor)
	return &resourceClient{
		ResourceStoreClient: NewResourceStoreClient(cc),
		ResourceIndexClient: NewResourceIndexClient(cc),
		DiagnosticsClient:   NewDiagnosticsClient(cc),
	}, nil
}

func NewCloudResourceClient(conn *grpc.ClientConn, cfg *setting.Cfg) (ResourceClient, error) {
	// scenario: remote cloud
	grpcClientConfig := clientCfgMapping(grpcutils.ReadGrpcClientConfig(cfg))

	opts := []authnlib.GrpcClientInterceptorOption{
		authnlib.WithIDTokenExtractorOption(idTokenExtractor),
		authnlib.WithMetadataExtractorOption(namespaceCloudExtractor(cfg.StackID)),
	}

	if cfg.Env == setting.Dev {
		opts = allowInsecureTransportOpt(&grpcClientConfig, opts)
	}

	clientInt, err := authnlib.NewGrpcClientInterceptor(&grpcClientConfig, opts...)
	if err != nil {
		return nil, err
	}

	cc := grpchan.InterceptClientConn(conn, clientInt.UnaryClientInterceptor, clientInt.StreamClientInterceptor)
	return &resourceClient{
		ResourceStoreClient: NewResourceStoreClient(cc),
		ResourceIndexClient: NewResourceIndexClient(cc),
		DiagnosticsClient:   NewDiagnosticsClient(cc),
	}, nil
}

func idTokenExtractor(ctx context.Context) (string, error) {
	authInfo, ok := claims.From(ctx)
	if !ok {
		return "", fmt.Errorf("no claims found")
	}

	extra := authInfo.GetExtra()
	if token, exists := extra["id-token"]; exists && len(token) != 0 && token[0] != "" {
		return token[0], nil
	}

	// If no token is found, create an internal token.
	// This is a workaround for StaticRequester not having a signed ID token.
	if staticRequester, ok := authInfo.(*identity.StaticRequester); ok {
		token, idClaims, err := createInternalToken(staticRequester)
		if err != nil {
			return "", fmt.Errorf("failed to create internal token: %w", err)
		}

		staticRequester.IDToken = token
		staticRequester.IDTokenClaims = idClaims
		return token, nil
	}

	return "", fmt.Errorf("id-token not found")
}

func namespaceExtractor(ctx context.Context) (string, []string, error) {
	// Using identity.Requester instead of claims.AuthInfo because Namespace() relies on AllowedKubernetesNamespace, which is empty.
	caller, err := identity.GetRequester(ctx)
	if err != nil {
		return "", nil, err
	}

	namespace := caller.GetAllowedKubernetesNamespace()
	if namespace == "" {
		namespace = claims.OrgNamespaceFormatter(caller.GetOrgID())
	}
	return authzlib.DefaultNamespaceMetadataKey, []string{namespace}, nil
}

func namespaceCloudExtractor(stackID string) func(ctx context.Context) (key string, values []string, err error) {
	return func(ctx context.Context) (key string, values []string, err error) {
		return authzlib.DefaultNamespaceMetadataKey, []string{"stacks-" + stackID}, nil
	}
}

func allowInsecureTransportOpt(grpcClientConfig *authnlib.GrpcClientConfig, opts []authnlib.GrpcClientInterceptorOption) []authnlib.GrpcClientInterceptorOption {
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	tokenClient, _ := authnlib.NewTokenExchangeClient(*grpcClientConfig.TokenClientConfig, authnlib.WithHTTPClient(client))
	return append(opts, authnlib.WithTokenClientOption(tokenClient))
}

func clientCfgMapping(clientCfg *grpcutils.GrpcClientConfig) authnlib.GrpcClientConfig {
	return authnlib.GrpcClientConfig{
		TokenClientConfig: &authnlib.TokenExchangeConfig{
			Token:            clientCfg.Token,
			TokenExchangeURL: clientCfg.TokenExchangeURL,
		},
		TokenRequest: &authnlib.TokenExchangeRequest{
			Namespace: clientCfg.TokenNamespace,
			Audiences: []string{resourceStoreAudience},
		},
	}
}

// createInternalToken creates a symmetrically signed token for using in in-proc mode only.
func createInternalToken(authInfo claims.AuthInfo) (string, *authnlib.Claims[authnlib.IDTokenClaims], error) {
	signerOpts := jose.SignerOptions{}
	signerOpts.WithType("jwt") // Should be uppercase, but this is what authlib expects
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: []byte("internal key")}, &signerOpts)
	if err != nil {
		return "", nil, err
	}

	identity := authInfo.GetIdentity()
	now := time.Now()
	tokenTTL := 10 * time.Minute
	idClaims := &auth.IDClaims{
		Claims: &jwt.Claims{
			Audience: identity.Audience(),
			Subject:  identity.Subject(),
			Expiry:   jwt.NewNumericDate(now.Add(tokenTTL)),
			IssuedAt: jwt.NewNumericDate(now),
		},
		Rest: authnlib.IDTokenClaims{
			Namespace:  identity.Namespace(),
			Identifier: identity.Identifier(),
			Type:       identity.IdentityType(),
		},
	}

	if claims.IsIdentityType(identity.IdentityType(), claims.TypeUser) {
		idClaims.Rest.Email = identity.Email()
		idClaims.Rest.EmailVerified = identity.EmailVerified()
		idClaims.Rest.AuthenticatedBy = identity.AuthenticatedBy()
		idClaims.Rest.Username = identity.Username()
		idClaims.Rest.DisplayName = identity.DisplayName()
	}

	builder := jwt.Signed(signer).Claims(&idClaims.Rest).Claims(idClaims.Claims)
	token, err := builder.CompactSerialize()
	if err != nil {
		return "", nil, err
	}

	return token, idClaims, nil
}