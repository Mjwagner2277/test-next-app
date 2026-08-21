import { ClientOnlyControlPanel } from './ClientOnlyControlPanel'

// This is the app-router home route for "/". The implementation lives in a
// separate client-only component because the operator console depends on
// browser-side MUI style insertion, runtime config fetches, and gRPC-Web calls.
export default function Home() {
  return <ClientOnlyControlPanel />
}
