package dualwrite

import (
	"context"
	"fmt"

	"github.com/grafana/authlib/claims"
	openfgav1 "github.com/openfga/api/proto/openfga/v1"

	"github.com/grafana/grafana/pkg/services/authz/zanzana"
	authzextv1 "github.com/grafana/grafana/pkg/services/authz/zanzana/proto/v1"
)

// legacyTupleCollector collects tuples groupd by object and tupleKey
type legacyTupleCollector func(ctx context.Context, orgId int64) (map[string]map[string]*openfgav1.TupleKey, error)

// zanzanaTupleCollector collects tuples from zanzana for given object
type zanzanaTupleCollector func(ctx context.Context, client zanzana.Client, object string, namespace string) (map[string]*openfgav1.TupleKey, error)

type resourceReconciler struct {
	name    string
	legacy  legacyTupleCollector
	zanzana zanzanaTupleCollector
	client  zanzana.Client
}

func newResourceReconciler(name string, legacy legacyTupleCollector, zanzana zanzanaTupleCollector, client zanzana.Client) resourceReconciler {
	return resourceReconciler{name, legacy, zanzana, client}
}

func (r resourceReconciler) reconcile(ctx context.Context, namespace string) error {
	info, err := claims.ParseNamespace(namespace)
	if err != nil {
		return err
	}

	// 1. Fetch grafana resources stored in grafana db.
	res, err := r.legacy(ctx, info.OrgID)
	if err != nil {
		return fmt.Errorf("failed to collect legacy tuples for %s: %w", r.name, err)
	}

	var (
		writes  = []*openfgav1.TupleKey{}
		deletes = []*openfgav1.TupleKeyWithoutCondition{}
	)

	for object, tuples := range res {
		// 2. Fetch all tuples for given object.
		// Due to limitations in open fga api we need to collect tuples per object
		zanzanaTuples, err := r.zanzana(ctx, r.client, object, namespace)
		if err != nil {
			return fmt.Errorf("failed to collect zanzanaa tuples for %s: %w", r.name, err)
		}

		// 3. Check if tuples from grafana db exists in zanzana and if not add them to writes
		for key, t := range tuples {
			stored, ok := zanzanaTuples[key]
			if !ok {
				writes = append(writes, t)
				continue
			}

			// 4. For folder resource tuples we also need to compare the stored group_resources
			if zanzana.IsFolderResourceTuple(t) && t.String() != stored.String() {
				deletes = append(deletes, &openfgav1.TupleKeyWithoutCondition{
					User:     t.User,
					Relation: t.Relation,
					Object:   t.Object,
				})

				writes = append(writes, t)
			}
		}

		// 5. Check if tuple from zanzana don't exists in grafana db, if not add them to deletes.
		for key, tuple := range zanzanaTuples {
			_, ok := tuples[key]
			if !ok {
				deletes = append(deletes, &openfgav1.TupleKeyWithoutCondition{
					User:     tuple.User,
					Relation: tuple.Relation,
					Object:   tuple.Object,
				})
			}
		}
	}

	if len(writes) == 0 && len(deletes) == 0 {
		return nil
	}

	if len(deletes) > 0 {
		err := batch(deletes, 100, func(items []*openfgav1.TupleKeyWithoutCondition) error {
			return r.client.Write(ctx, &authzextv1.WriteRequest{
				Deletes: &authzextv1.WriteRequestDeletes{TupleKeys: zanzana.ToAuthzExtTuplesWithoutCondition(items)},
			})
		})

		if err != nil {
			return err
		}
	}

	if len(writes) > 0 {
		err := batch(writes, 100, func(items []*openfgav1.TupleKey) error {
			return r.client.Write(ctx, &authzextv1.WriteRequest{
				Writes: &authzextv1.WriteRequestWrites{TupleKeys: zanzana.ToAuthzExtTuples(items)},
			})
		})

		if err != nil {
			return err
		}
	}

	return nil
}
