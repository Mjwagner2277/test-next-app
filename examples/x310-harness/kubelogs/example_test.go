package kubelogs_test

import (
	"context"
	"fmt"
	"time"

	"gitlab.com/m2ke-group/kubelogs/kubelogs"
)

func ExampleWaiter_WaitFor() {
	// Use your *kubelogs.Collector as Source in a real harness. This example
	// supplies a snapshot so it can run without Kubernetes or any X-310 code.
	logs := kubelogs.Waiter{Source: exampleSource{}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	hits, err := logs.WaitFor(ctx,
		kubelogs.Query{Pod: "service-0", Container: "app"},
		kubelogs.Rule{Regex: `^connection [0-9]+ established$`},
	)
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(hits[0].Message)
	// Output: connection 42 established
}

func ExampleWaiter_WaitForSequence() {
	logs := kubelogs.Waiter{Source: exampleSource{}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	hits, err := logs.WaitForSequence(ctx,
		kubelogs.Query{Pod: "service-0", Container: "app"},
		kubelogs.Rule{Exact: "Starting"},
		kubelogs.Rule{Regex: `^connection [0-9]+ established$`},
		kubelogs.Rule{Exact: "Ready"},
	)
	if err != nil {
		fmt.Println(err)
		return
	}
	for _, hit := range hits {
		fmt.Println(hit.Message)
	}
	// Output:
	// Starting
	// connection 42 established
	// Ready
}

type exampleSource struct{}

func (exampleSource) Collect(context.Context, time.Time) (kubelogs.Report, error) {
	target := kubelogs.Target{Namespace: "example", Pod: "service-0", Container: "app"}
	r := kubelogs.Report{
		Complete: true,
		Targets:  []kubelogs.Target{target},
	}
	for _, message := range []string{"Starting", "heartbeat", "connection 42 established", "Ready"} {
		r.Entries = append(r.Entries, kubelogs.Entry{Target: target, Time: time.Now(), Message: message})
	}
	return r, nil
}
