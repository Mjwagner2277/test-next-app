// Package x310 defines sensor state, temperature classification and device XML.
package x310

const AlertThreshold = 122

// State uses input1state..input4state for breaker contacts and sensor1..sensor4
// for integer temperatures. A false breaker indicates a fault; true is normal.
type State struct {
	Breakers     [4]bool
	Temperatures [4]int
}

func TemperatureAlert(value int) bool { return value >= AlertThreshold }
