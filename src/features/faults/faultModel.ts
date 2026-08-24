import {
  CardModel,
  Status,
  type ResponseStatus,
  type SignalsResponse,
} from '@/gen/proto/controlpanel/v1/control_panel_pb'

export type SensorRow = {
  id: string
  name: string
  location: string
  liveReading: string
  defaultVariant: UiFaultVariant
  signalMapping: SignalMapping
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
  isSuccessful: (response: Response) => boolean
  onSuccess?: () => void
}

export const SENSOR_ROWS: SensorRow[] = [
  {
    id: 'temperature-a',
    name: 'Temperature A',
    location: 'Zone 1 inlet',
    liveReading: '72.4 F',
    defaultVariant: 'High',
    signalMapping: {
      signalId: 1001n,
      cardModel: CardModel.TYPE1,
      values: {
        High: { case: 'analog', value: 4095 },
        Low: { case: 'analog', value: 0 },
        Unknown: { case: 'serial', value: 'UNKNOWN' },
      },
    },
  },
  {
    id: 'interlock-b',
    name: 'Interlock B',
    location: 'Access panel',
    liveReading: 'Closed',
    defaultVariant: 'Low',
    signalMapping: {
      signalId: 2001n,
      cardModel: CardModel.TYPE2,
      values: {
        High: { case: 'discrete', value: true },
        Low: { case: 'discrete', value: false },
        Unknown: { case: 'serial', value: 'UNKNOWN' },
      },
    },
  },
]

export const FAULT_VARIANTS: UiFaultVariant[] = ['High', 'Low', 'Unknown']

// Start clear so both sample rows are immediately usable during review.
export const INITIAL_ACTIVE_FAULTS: ActiveFault[] = []

export const defaultSelectedVariants = Object.fromEntries(
  SENSOR_ROWS.map((sensor) => [sensor.id, sensor.defaultVariant]),
) as Record<string, UiFaultVariant>

export function toSignal(sensor: SensorRow, variant: UiFaultVariant) {
  // This is the abstraction layer between the operator table and the proto. The
  // UI never needs to expose card model enum values or signal ids; rows own that
  // mapping here.
  return {
    signalId: sensor.signalMapping.signalId,
    cardModel: sensor.signalMapping.cardModel,
    signalValue: sensor.signalMapping.values[variant],
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

export function isSignalsResponseSuccessful(response: SignalsResponse) {
  // setSignal/removeSignals return the full response. It can include per-signal
  // errors, but this first UI pass only gates local state on the response status.
  return isResponseStatusSuccessful(response.responseStatus)
}

export function isResponseStatusSuccessful(responseStatus?: ResponseStatus) {
  return responseStatus?.status === Status.SUCCESS
}

type SignalMapping = {
  signalId: bigint
  cardModel: CardModel
  values: Record<UiFaultVariant, SignalValue>
}

type SignalValue =
  | { case: 'discrete'; value: boolean }
  | { case: 'analog'; value: number }
  | { case: 'serial'; value: string }
