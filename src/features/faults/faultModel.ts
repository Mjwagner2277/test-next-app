import {
  FaultCommandResult,
  FaultVariant,
  type FaultCommandResponse,
} from '@/gen/proto/controlpanel/v1/control_panel_pb'

export type SensorRow = {
  id: string
  name: string
  location: string
  liveReading: string
  defaultVariant: UiFaultVariant
}

export type UiFaultVariant = 'High' | 'Low' | 'Unknown'

export type ActiveFault = {
  sensorId: string
  sensorName: string
  variant: UiFaultVariant
  insertedAt: string
  detail: string
}

export type RpcRunOptions = {
  name: string
  call: () => Promise<FaultCommand>
  onAccepted?: () => void
}

export type FaultCommand = FaultCommandResponse

export const SENSOR_ROWS: SensorRow[] = [
  {
    id: 'temperature-a',
    name: 'Temperature A',
    location: 'Zone 1 inlet',
    liveReading: '72.4 F',
    defaultVariant: 'High',
  },
  {
    id: 'pressure-b',
    name: 'Pressure B',
    location: 'Hydraulic line',
    liveReading: '11.2 psi',
    defaultVariant: 'Low',
  },
  {
    id: 'vibration-c',
    name: 'Vibration C',
    location: 'Bearing housing',
    liveReading: '0.18 g',
    defaultVariant: 'Unknown',
  },
  {
    id: 'flow-d',
    name: 'Flow D',
    location: 'Return manifold',
    liveReading: '38.6 lpm',
    defaultVariant: 'Unknown',
  },
  {
    id: 'humidity-e',
    name: 'Humidity E',
    location: 'Cabinet ambient',
    liveReading: '44%',
    defaultVariant: 'Low',
  },
  {
    id: 'position-f',
    name: 'Position F',
    location: 'Actuator feedback',
    liveReading: '12.8 mm',
    defaultVariant: 'High',
  },
]

export const FAULT_VARIANTS: UiFaultVariant[] = ['High', 'Low', 'Unknown']

// Seeded active faults make the reviewed screen immediately show what "in the
// system" looks like, even before a real coordinator is reachable locally.
export const INITIAL_ACTIVE_FAULTS: ActiveFault[] = [
  {
    sensorId: 'pressure-b',
    sensorName: 'Pressure B',
    variant: 'Low',
    insertedAt: '01:42',
    detail: 'Inserted by operator',
  },
  {
    sensorId: 'flow-d',
    sensorName: 'Flow D',
    variant: 'Unknown',
    insertedAt: '00:39',
    detail: 'Inserted by operator',
  },
]

export const defaultSelectedVariants = Object.fromEntries(
  SENSOR_ROWS.map((sensor) => [sensor.id, sensor.defaultVariant]),
) as Record<string, UiFaultVariant>

export function toProtoVariant(variant: UiFaultVariant) {
  // The UI uses friendly labels while the wire protocol uses generated enum
  // values. Keeping this conversion in one place makes proto changes obvious.
  switch (variant) {
    case 'High':
      return FaultVariant.HIGH
    case 'Low':
      return FaultVariant.LOW
    case 'Unknown':
      return FaultVariant.UNKNOWN
  }
}

export function upsertActiveFault(
  current: ActiveFault[],
  nextFault: ActiveFault,
) {
  const remaining = current.filter(
    (fault) => fault.sensorId !== nextFault.sensorId,
  )

  return [nextFault, ...remaining]
}

export function isAcceptedCommand(response: FaultCommand) {
  // The backend no longer returns a state snapshot. SUCCESS is the only signal
  // this browser has that the coordinator accepted the command, so only then do
  // we update local "in system" state.
  return response.result === FaultCommandResult.SUCCESS
}
