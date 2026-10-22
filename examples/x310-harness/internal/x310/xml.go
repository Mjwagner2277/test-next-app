package x310

import (
	"encoding/xml"
	"fmt"
)

type Encoder func(State) ([]byte, error)

// EncodeXML follows the state.xml example in the X-310 v1.5 manual.
// This is a sensor-only fixture, not a complete device emulator. Substitute an
// Encoder if your firmware/parser needs sensorXtemp or additional device fields.
// Alarm flags are intentionally omitted: the UUT must classify temperatures.
func EncodeXML(s State) ([]byte, error) {
	var body string
	for i, b := range s.Breakers {
		value := 0
		if b {
			value = 1
		}
		body += fmt.Sprintf("<input%dstate>%d</input%dstate>", i+1, value, i+1)
	}
	for i, value := range s.Temperatures {
		body += fmt.Sprintf("<sensor%d>%d</sensor%d>", i+1, value, i+1)
	}
	return []byte(xml.Header + "<datavalues>" + body + "</datavalues>"), nil
}
