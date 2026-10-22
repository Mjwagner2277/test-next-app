package kubelogs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	typed "k8s.io/client-go/kubernetes/typed/core/v1"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// ClientConfig supports explicit kubeconfig, in-cluster service accounts and
// standard local kubeconfig loading (including KUBECONFIG and exec credentials).
func ClientConfig(kubeconfig string) (*rest.Config, error) {
	if kubeconfig != "" {
		return clientcmd.BuildConfigFromFlags("", kubeconfig)
	}
	config, err := rest.InClusterConfig()
	if err == nil {
		return config, nil
	}
	if err != rest.ErrNotInCluster {
		return nil, err
	}
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{}).ClientConfig()
}

type Kubernetes struct{ Client typed.CoreV1Interface }

func (k Kubernetes) Targets(ctx context.Context, namespace, selector string) ([]Target, error) {
	if k.Client == nil {
		return nil, errors.New("Kubernetes client is required")
	}
	var targets []Target
	continuation := ""
	for {
		pods, err := k.Client.Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector, Limit: 500, Continue: continuation})
		if err != nil {
			return nil, err
		}
		for _, pod := range pods.Items {
			statuses := append([]corev1.ContainerStatus(nil), pod.Status.InitContainerStatuses...)
			statuses = append(statuses, pod.Status.ContainerStatuses...)
			statuses = append(statuses, pod.Status.EphemeralContainerStatuses...)
			expected := len(pod.Spec.Containers) + len(pod.Spec.InitContainers) + len(pod.Spec.EphemeralContainers)
			if len(statuses) != expected {
				return nil, fmt.Errorf("pod %s has containers without log status", pod.Name)
			}
			for _, s := range statuses {
				if s.ContainerID == "" || (s.State.Running == nil && s.State.Terminated == nil) {
					return nil, fmt.Errorf("pod %s container %s has no readable running/terminated instance", pod.Name, s.Name)
				}
				targets = append(targets, Target{Namespace: namespace, Pod: pod.Name, UID: string(pod.UID), Container: s.Name, ContainerID: s.ContainerID, Restarts: s.RestartCount})
			}
		}
		continuation = pods.Continue
		if continuation == "" {
			return targets, nil
		}
	}
}
func (k Kubernetes) Read(ctx context.Context, target Target, since time.Time) (io.ReadCloser, error) {
	if k.Client == nil {
		return nil, errors.New("Kubernetes client is required")
	}
	options := &corev1.PodLogOptions{Container: target.Container, Timestamps: true, Follow: false}
	if !since.IsZero() {
		at := metav1.NewTime(since.Truncate(time.Second))
		options.SinceTime = &at
	}
	return k.Client.Pods(target.Namespace).GetLogs(target.Pod, options).Stream(ctx)
}
