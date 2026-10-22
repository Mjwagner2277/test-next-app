// Package scenario defines the ordered breaker and temperature test cases.
package scenario

import (
	"fmt"

	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

type Scenario struct {
	Name  string
	State x310.State
}

func Baseline() x310.State {
	return x310.State{Breakers: [4]bool{true, true, true, true}, Temperatures: [4]int{70, 71, 72, 73}}
}

func All() []Scenario {
	normal := Baseline()
	steps := []Scenario{{"baseline", normal}}
	for i := range normal.Breakers {
		state := normal
		state.Breakers[i] = false
		steps = append(steps, Scenario{fmt.Sprintf("breaker_%d_false", i+1), state}, Scenario{fmt.Sprintf("breaker_%d_restored", i+1), normal})
	}
	for i := range normal.Temperatures {
		for _, value := range []int{121, 122, 123} {
			state := normal
			state.Temperatures[i] = value
			steps = append(steps, Scenario{fmt.Sprintf("probe_%d_temperature_%d", i+1, value), state}, Scenario{fmt.Sprintf("probe_%d_recovery_%d", i+1, value), normal})
		}
	}
	// Repeat each state so log-on-change is checked against an unchanged poll,
	// including hot probes where no new edge-triggered alert is expected.
	checks := make([]Scenario, 0, 2*len(steps))
	for _, step := range steps {
		checks = append(checks, step, Scenario{Name: step.Name + "_unchanged", State: step.State})
	}
	return checks
}
