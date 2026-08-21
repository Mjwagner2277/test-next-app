import {
  FaultVariant,
  type FaultCommandResponse,
  type FaultStateResponse,
  type SensorFault,
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

export type RpcRunOptions<Response> = {
  name: string
  call: () => Promise<Response>
  onAccepted?: () => void
  onSuccess?: (response: Response) => void
}

export type FaultCommand = FaultCommandResponse
export type FaultState = FaultStateResponse

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

const sensorById = new Map(SENSOR_ROWS.map((sensor) => [sensor.id, sensor]))

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

export function toUiVariant(variant: FaultVariant): UiFaultVariant {
  switch (variant) {
    case FaultVariant.HIGH:
      return 'High'
    case FaultVariant.LOW:
      return 'Low'
    case FaultVariant.UNKNOWN:
    case FaultVariant.UNSPECIFIED:
      return 'Unknown'
    default:
      return 'Unknown'
  }
}

export function toActiveFault(fault: SensorFault): ActiveFault {
  const catalogSensor = sensorById.get(fault.sensorId)

  return {
    sensorId: fault.sensorId,
    sensorName: fault.sensorName || catalogSensor?.name || fault.sensorId,
    variant: toUiVariant(fault.variant),
    insertedAt: fault.insertedAt || 'server active',
    detail: fault.detail || 'Reported by coordinator',
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

export function hasServerFaultState(
  response: unknown,
): response is Pick<FaultStateResponse, 'activeFaults'> {
  return (
    typeof response === 'object' &&
    response !== null &&
    Array.isArray((response as FaultStateResponse).activeFaults)
  )
}

export function isAcceptedCommand(response: unknown) {
  // FaultStateResponse has no accepted field, so a successful response to
  // GetFaultState should still be treated as accepted.
  if (
    typeof response === 'object' &&
    response !== null &&
    'accepted' in response
  ) {
    return (response as FaultCommandResponse).accepted
  }

  return true
}
