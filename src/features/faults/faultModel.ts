import {
  CardModel,
  Status,
  type ResponseStatus,
  type SignalsResponse,
} from '@/gen/proto/controlpanel/v1/control_panel_pb'

type FaultClassConfig = {
  id: string
  label: string
  variants: readonly FaultVariantOptionConfig[]
}

type FaultVariantOptionConfig = {
  id: string
  label: string
  color: string
}

// Fault classes are the operator-facing categories of fault behavior. Adding a
// new class means adding one object here, then pointing any matching sensor rows
// at its id through sensor.faultClassId. The id types below are derived from
// this list, so TypeScript will catch typos in sensor rows.
export const FAULT_CLASSES = [
  {
    id: 'threshold',
    label: 'Threshold',
    variants: [
      { id: 'high', label: 'High', color: '#ffb0a6' },
      { id: 'low', label: 'Low', color: '#8ae4ec' },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    variants: [
      { id: 'engaged', label: 'Engaged', color: '#71cf84' },
      { id: 'disengaged', label: 'Disengaged', color: '#f0bf58' },
    ],
  },
  {
    id: 'position',
    label: 'Position',
    variants: [
      { id: 'open', label: 'Open', color: '#f0bf58' },
      { id: 'shut', label: 'Shut', color: '#71cf84' },
    ],
  },
] as const satisfies readonly FaultClassConfig[]

export type FaultClass = (typeof FAULT_CLASSES)[number]
export type FaultClassId = FaultClass['id']
export type FaultVariantOption = FaultClass['variants'][number]
export type FaultVariantId = FaultVariantOption['id']
type FaultClassForId<Id extends FaultClassId> = Extract<
  FaultClass,
  { id: Id }
>
type FaultVariantIdForClass<Id extends FaultClassId> =
  FaultClassForId<Id>['variants'][number]['id']

export type SelectedFaultVariants = Partial<Record<string, FaultVariantId>>

type BaseSensorRow = {
  id: string
  name: string
  location: string
  liveReading: string
}

export type SensorRow = {
  [Id in FaultClassId]: BaseSensorRow & {
    faultClassId: Id
    defaultVariant: FaultVariantIdForClass<Id>
    signalMapping: SignalMapping<FaultVariantIdForClass<Id>>
  }
}[FaultClassId]

export type ActiveFault = {
  sensorId: string
  variant: FaultVariantId
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
    // The threshold class gives this row a High/Low dropdown. Each id used by
    // that class should have a matching proto payload in signalMapping.values.
    faultClassId: 'threshold',
    defaultVariant: 'high',
    signalMapping: {
      signalId: 1001n,
      cardModel: CardModel.TYPE1,
      values: {
        high: { case: 'analog', value: 4095 },
        low: { case: 'analog', value: 0 },
      },
    },
  },
  {
    id: 'interlock-b',
    name: 'Interlock B',
    location: 'Access panel',
    liveReading: 'Closed',
    // The position class gives this row an Open/Shut dropdown. The UI stays
    // readable while the signal id, card model, and proto value stay hidden here.
    faultClassId: 'position',
    defaultVariant: 'open',
    signalMapping: {
      signalId: 2001n,
      cardModel: CardModel.TYPE2,
      values: {
        open: { case: 'discrete', value: false },
        shut: { case: 'discrete', value: true },
      },
    },
  },
]

// Seed one fault during UI review so the active-fault display, highlighted row,
// and remove/reset controls can be inspected immediately on page load.
export const INITIAL_ACTIVE_FAULTS: ActiveFault[] = [
  {
    sensorId: 'temperature-a',
    variant: 'high',
    insertedAt: 'on startup',
    detail: 'Seeded for UI review',
  },
]

export const defaultSelectedVariants = Object.fromEntries(
  SENSOR_ROWS.map((sensor) => [sensor.id, sensor.defaultVariant]),
) as SelectedFaultVariants

export function formatFaultLabel(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

export function getSensorById(sensors: SensorRow[], sensorId: string) {
  return sensors.find((sensor) => sensor.id === sensorId)
}

export function getSelectedFaultVariant(
  sensor: SensorRow,
  selectedVariants: SelectedFaultVariants,
) {
  return selectedVariants[sensor.id] ?? sensor.defaultVariant
}

export function getFaultClass<Id extends FaultClassId>(sensor: {
  faultClassId: Id
}) {
  const faultClass = FAULT_CLASSES.find(
    (candidate) => candidate.id === sensor.faultClassId,
  ) as FaultClassForId<Id> | undefined

  if (!faultClass) {
    throw new Error(`Unknown fault class "${sensor.faultClassId}"`)
  }

  return faultClass
}

export function getFaultVariantOptions(sensor: SensorRow) {
  return getFaultClass(sensor).variants
}

export function getFaultVariantOption(
  sensor: SensorRow,
  variant: FaultVariantId,
) {
  return getFaultVariantOptions(sensor).find(
    (option) => option.id === variant,
  )
}

export function getFaultVariantLabel(
  sensor: SensorRow,
  variant: FaultVariantId,
) {
  return (
    getFaultVariantOption(sensor, variant)?.label ?? formatFaultLabel(variant)
  )
}

export function getFaultVariantColor(
  sensor: SensorRow,
  variant: FaultVariantId,
) {
  return getFaultVariantOption(sensor, variant)?.color ?? '#c5d0da'
}

export function toSignal(sensor: SensorRow, variant: FaultVariantId) {
  // This is the abstraction layer between the operator table and the proto. The
  // UI never needs to expose card model enum values or signal ids; rows own that
  // mapping here.
  const signalValues = sensor.signalMapping.values as Partial<
    Record<FaultVariantId, SignalValue>
  >
  const signalValue = signalValues[variant]

  if (!signalValue) {
    throw new Error(`${sensor.name} does not define variant "${variant}"`)
  }

  return {
    signalId: sensor.signalMapping.signalId,
    cardModel: sensor.signalMapping.cardModel,
    signalValue,
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

type SignalMapping<VariantId extends FaultVariantId = FaultVariantId> = {
  signalId: bigint
  cardModel: CardModel
  values: Record<VariantId, SignalValue>
}

type SignalValue =
  | { case: 'discrete'; value: boolean }
  | { case: 'analog'; value: number }
  | { case: 'serial'; value: string }
