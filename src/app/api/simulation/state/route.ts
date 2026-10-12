import { readSimulationState, updateSimulationState } from '@/features/simulation/simulationStore'
import { validateStateUpdate } from '@/features/simulation/simulationState'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    return Response.json(await readSimulationState(), { headers })
  } catch (error) {
    console.error('Unable to read simulation state', error)
    return Response.json({ error: 'Unable to read simulation state.' }, { status: 500, headers })
  }
}

export async function PATCH(request: Request) {
  let update
  try {
    update = validateStateUpdate(await request.json())
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid state update.' }, { status: 400, headers })
  }
  try {
    return Response.json(await updateSimulationState(update), { headers })
  } catch (error) {
    console.error('Unable to update simulation state', error)
    return Response.json({ error: 'Unable to save simulation state.' }, { status: 500, headers })
  }
}
