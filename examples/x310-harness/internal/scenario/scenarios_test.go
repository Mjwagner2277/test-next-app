package scenario

import (
	"fmt"
	"testing"

	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

// Independently enumerate the original X-310 requirements: each breaker changes
// both ways; every probe visits 121, 122 and 123 with recovery after each value.
func TestRequiredInputCoverage(t *testing.T) {
	previous := Baseline()
	changes := map[string]int{}
	for _, step := range All() {
		changed := 0
		for i, value := range step.State.Breakers {
			if value != previous.Breakers[i] {
				changes[fmt.Sprintf("breaker/%d/%t", i+1, value)]++
				changed++
			}
		}
		for i, value := range step.State.Temperatures {
			if value != previous.Temperatures[i] {
				changes[fmt.Sprintf("probe/%d/%d", i+1, value)]++
				changed++
			}
		}
		if changed > 1 { t.Fatalf("%s changes %d inputs; expected isolated scenarios", step.Name, changed) }
		previous = step.State
	}
	for id := 1; id <= 4; id++ {
		for _, value := range []bool{false, true} {
			key := fmt.Sprintf("breaker/%d/%t", id, value)
			if changes[key] != 1 { t.Errorf("%s: got %d transitions, want 1", key, changes[key]) }
		}
		for _, value := range []int{121, 122, 123} {
			key := fmt.Sprintf("probe/%d/%d", id, value)
			if changes[key] != 1 { t.Errorf("%s: got %d transitions, want 1", key, changes[key]) }
		}
		key := fmt.Sprintf("probe/%d/%d", id, Baseline().Temperatures[id-1])
		if changes[key] != 3 { t.Errorf("%s: got %d recoveries, want 3", key, changes[key]) }
	}
	for value, alert := range map[int]bool{121: false, 122: true, 123: true} {
		if x310.TemperatureAlert(value) != alert { t.Errorf("temperature %d: want alert=%t", value, alert) }
	}
}

func TestScenariosResetBetweenAlerts(t *testing.T) {
	all := All()
	if len(all) != 66 {
		t.Fatalf("got %d scenarios", len(all))
	}
	var steps []Scenario
	for i := 0; i < len(all); i += 2 {
		if all[i+1].Name != all[i].Name+"_unchanged" || all[i+1].State != all[i].State {
			t.Fatalf("missing unchanged check after %q", all[i].Name)
		}
		steps = append(steps, all[i])
	}
	seen := map[string]bool{}
	for i, step := range steps {
		if seen[step.Name] {
			t.Fatalf("duplicate scenario %q", step.Name)
		}
		seen[step.Name] = true
		for _, temperature := range step.State.Temperatures {
			if temperature >= x310.AlertThreshold {
				if i == 0 || i+1 == len(steps) || steps[i-1].State != Baseline() || steps[i+1].State != Baseline() {
					t.Fatalf("alert scenario %q must have baseline before and after", step.Name)
				}
			}
		}
	}
	if len(steps) != 33 {
		t.Fatalf("got %d scenarios", len(steps))
	}
}
