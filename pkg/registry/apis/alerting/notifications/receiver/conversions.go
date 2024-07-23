package receiver

import (
	alertingNotify "github.com/grafana/alerting/notify"
	"github.com/prometheus/alertmanager/config"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	model "github.com/grafana/grafana/pkg/apis/alerting_notifications/v0alpha1"
	"github.com/grafana/grafana/pkg/components/simplejson"
	"github.com/grafana/grafana/pkg/services/apiserver/endpoints/request"
	"github.com/grafana/grafana/pkg/services/ngalert/models"
	"github.com/grafana/grafana/pkg/services/ngalert/notifier/channels_config"
)

func convertToK8sResources(orgID int64, receivers []*models.Receiver, namespacer request.NamespaceMapper) (*model.ReceiverList, error) {
	result := &model.ReceiverList{
		Items: make([]model.Receiver, 0, len(receivers)),
	}
	for _, receiver := range receivers {
		k8sResource, err := convertToK8sResource(orgID, receiver, namespacer)
		if err != nil {
			return nil, err
		}
		result.Items = append(result.Items, *k8sResource)
	}
	return result, nil
}

func convertToK8sResource(orgID int64, receiver *models.Receiver, namespacer request.NamespaceMapper) (*model.Receiver, error) {
	spec := model.ReceiverSpec{
		Title: receiver.Name,
	}
	for _, integration := range receiver.Integrations {
		k8Integration := model.Integration{
			Uid:                   &integration.UID,
			Type:                  integration.Type,
			DisableResolveMessage: &integration.DisableResolveMessage,
			Settings:              integration.Settings,
			SecureFields:          make(map[string]bool, len(integration.SecureSettings)),
		}

		settings := simplejson.New()
		if integration.Settings != nil {
			var err error
			settings, err = simplejson.NewJson(integration.Settings)
			if err != nil {
				return nil, err
			}
		}

		for k, v := range integration.SecureSettings {
			if v != "" {
				settings.Set(k, v)
				k8Integration.SecureFields[k] = true
			}
		}

		jsonBytes, err := settings.MarshalJSON()
		if err != nil {
			return nil, err
		}

		k8Integration.Settings = jsonBytes

		spec.Integrations = append(spec.Integrations, k8Integration)
	}

	uid := receiver.GetUID() // TODO replace to stable UID when we switch to normal storage
	r := &model.Receiver{
		TypeMeta: resourceInfo.TypeMeta(),
		ObjectMeta: metav1.ObjectMeta{
			UID:             types.UID(uid), // This is needed to make PATCH work
			Name:            uid,            // TODO replace to stable UID when we switch to normal storage
			Namespace:       namespacer(orgID),
			ResourceVersion: "", // TODO: Implement optimistic concurrency.
		},
		Spec: spec,
	}
	r.SetProvenanceStatus(string(receiver.Provenance))
	return r, nil
}

func convertToDomainModel(receiver *model.Receiver) (*models.Receiver, error) {
	domain := &models.Receiver{
		APIReceiver: alertingNotify.APIReceiver{
			ConfigReceiver: config.Receiver{
				Name: receiver.Spec.Title,
			},
			GrafanaIntegrations: alertingNotify.GrafanaIntegrations{
				Integrations: make([]*alertingNotify.GrafanaIntegrationConfig, 0, len(receiver.Spec.Integrations)),
			},
		},
	}

	for _, integration := range receiver.Spec.Integrations {
		grafanaIntegration := alertingNotify.GrafanaIntegrationConfig{
			Name:           receiver.Spec.Title,
			Type:           integration.Type,
			SecureSettings: make(map[string]string),
			//Provenance:   "", //TODO: Convert provenance?
		}
		if integration.Uid != nil {
			grafanaIntegration.UID = *integration.Uid
		}
		if integration.DisableResolveMessage != nil {
			grafanaIntegration.DisableResolveMessage = *integration.DisableResolveMessage
		}

		// Now we need to create secure settings. Secure settings should only store new or updated secure fields.
		// Secure settings that are unchanged will be loaded from the existing receiver.
		// So, this means we rely on the caller to let us know when a secure settings is unchanged by marking it in SecureFields.
		settings := simplejson.New()
		if integration.Settings != nil {
			var err error
			settings, err = simplejson.NewJson(integration.Settings)
			if err != nil {
				return nil, err
			}
		}

		// These are the fields the caller is telling us to load from the existing receiver. Let's ensure they don't exist in settings.
		for k, v := range integration.SecureFields {
			if v {
				settings.Del(k)
			}
		}

		// Now we extract remaining secure settings from settings into secure settings. These should be the new or updated secure settings.
		secretKeys, err := channels_config.GetSecretKeysForContactPointType(integration.Type)
		if err != nil {
			return nil, err
		}
		for _, key := range secretKeys {
			secretVal := settings.Get(key).MustString()
			if secretVal != "" {
				settings.Del(key)
				grafanaIntegration.SecureSettings[key] = secretVal
			}
		}
		settingsBytes, err := settings.MarshalJSON()
		if err != nil {
			return nil, err
		}
		grafanaIntegration.Settings = settingsBytes

		domain.Integrations = append(domain.Integrations, &grafanaIntegration)
	}

	return domain, nil
}
