package kubelogs

import (
	"fmt"
	"regexp"
	"time"
)

// Rule matches the complete message with Exact, or uses Go regexp syntax with
// Regex. Set exactly one. Use ^ and $ when a regex must match the entire message.
type Rule struct {
	Exact string `json:"exact,omitempty"`
	Regex string `json:"regex,omitempty"`
}
type Matcher struct {
	rule  Rule
	regex *regexp.Regexp
}

func Compile(rule Rule) (Matcher, error) {
	if (rule.Exact == "") == (rule.Regex == "") {
		return Matcher{}, fmt.Errorf("set exactly one nonempty exact or regex rule")
	}
	m := Matcher{rule: rule}
	if rule.Regex != "" {
		r, err := regexp.Compile(rule.Regex)
		if err != nil {
			return m, err
		}
		m.regex = r
	}
	return m, nil
}
func (m Matcher) Matches(message string) bool {
	if m.regex != nil {
		return m.regex.MatchString(message)
	}
	return message == m.rule.Exact
}

// Query scopes a match to a source and time interval. Empty source fields match all.
type Query struct {
	Pod, Container string
	Since, Until   time.Time
}

func (q Query) Includes(e Entry) bool {
	return q.includesTarget(e.Target) && (q.Since.IsZero() || !e.Time.Before(q.Since)) && (q.Until.IsZero() || !e.Time.After(q.Until))
}

func (q Query) includesTarget(t Target) bool {
	return (q.Pod == "" || q.Pod == t.Pod) && (q.Container == "" || q.Container == t.Container)
}

func (r Report) assertable() error {
	if r.DiagnosticOnly {
		return fmt.Errorf("archive includes partial failed attempts; assert against a complete collection report")
	}
	if !r.Complete {
		return fmt.Errorf("cannot assert against incomplete log collection")
	}
	return nil
}

func (r Report) Find(q Query, m Matcher) ([]Entry, error) {
	if err := r.assertable(); err != nil {
		return nil, err
	}
	var entries []Entry
	for _, e := range r.Entries {
		if q.Includes(e) && m.Matches(e.Message) {
			entries = append(entries, e)
		}
	}
	return entries, nil
}
