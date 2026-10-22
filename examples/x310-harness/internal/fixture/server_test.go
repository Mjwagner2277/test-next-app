package fixture

import (
	"context"
	"encoding/xml"
	"errors"
	"net/http"
	"testing"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

func TestMutableXML(t *testing.T) {
	s, err := Start("127.0.0.1:0", x310.State{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, state := range []x310.State{
		{Breakers: [4]bool{true, false, true, false}, Temperatures: [4]int{121, 122, 123, -10}},
		{Breakers: [4]bool{false, true, false, true}, Temperatures: [4]int{70, 71, 72, 73}},
	} {
		before := time.Now()
		revision, changedAt := s.Set(state)
		if changedAt.Before(before) || changedAt.After(time.Now()) {
			t.Fatal("change timestamp is outside the update window")
		}
		response, err := http.Get(s.URL)
		if err != nil {
			t.Fatal(err)
		}
		var got struct {
			XMLName xml.Name `xml:"datavalues"`
			B1      int      `xml:"input1state"`
			B2      int      `xml:"input2state"`
			B3      int      `xml:"input3state"`
			B4      int      `xml:"input4state"`
			T1      int      `xml:"sensor1"`
			T2      int      `xml:"sensor2"`
			T3      int      `xml:"sensor3"`
			T4      int      `xml:"sensor4"`
		}
		err = xml.NewDecoder(response.Body).Decode(&got)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != 200 {
			t.Fatal(response.Status)
		}
		if actual := [4]bool{got.B1 == 1, got.B2 == 1, got.B3 == 1, got.B4 == 1}; actual != state.Breakers {
			t.Fatalf("breakers: %v", actual)
		}
		if actual := [4]int{got.T1, got.T2, got.T3, got.T4}; actual != state.Temperatures {
			t.Fatalf("temperatures: %v", actual)
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		err = s.WaitPolled(ctx, revision)
		cancel()
		if err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	revision, _ := s.Set(x310.State{})
	if err := s.WaitPolled(ctx, revision); !errors.Is(err, context.Canceled) {
		t.Fatalf("unpolled revision: %v", err)
	}
}
