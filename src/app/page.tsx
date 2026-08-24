import { ControlPanelConsole } from './ControlPanelConsole'

// This is the app-router home route for "/". The implementation lives in a
// client component because the operator console depends on runtime config
// fetches, React state, and browser-side gRPC-Web calls.
export default function Home() {
  return <ControlPanelConsole />
}
