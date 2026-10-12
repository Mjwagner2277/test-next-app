import {
  CardModel,
  Status,
  type ResponseStatus,
  type Signal,
  type SignalsResponse,
} from '../../gen/proto/controlpanel/v1/control_panel_pb'

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

// Classes define the dropdown choices, not the signals that create a fault.
// Each row supplies its own signal suite for every choice in its class. For
// example, several rows can use State -> Unknown with different sets of signals.
// Add a class here to introduce new choices; the id types below are derived
// from this list so TypeScript catches mismatched row mappings.
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
  {
    id: 'state',
    label: 'State',
    variants: [
      { id: 'unknown', label: 'Unknown', color: '#f0bf58' },
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
  // A row represents one user-facing fault target. It can coordinate several
  // physical sensors, such as "XXXX state unknown".
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
    // that class maps to one or more signals in signalMapping.
    faultClassId: 'threshold',
    defaultVariant: 'high',
    signalMapping: {
      high: [
        {
          signalId: 1001n,
          cardModel: CardModel.TYPE1,
          signalValue: { case: 'analog', value: 4095 },
        },
      ],
      low: [
        {
          signalId: 1001n,
          cardModel: CardModel.TYPE1,
          signalValue: { case: 'analog', value: 0 },
        },
      ],
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
      open: [
        {
          signalId: 2001n,
          cardModel: CardModel.TYPE2,
          signalValue: { case: 'discrete', value: false },
        },
      ],
      shut: [
        {
          signalId: 2001n,
          cardModel: CardModel.TYPE2,
          signalValue: { case: 'discrete', value: true },
        },
      ],
    },
  },
]

// Start from a blank slate. The UI only marks faults active after the
// coordinator accepts an inject command during this browser session.
export const INITIAL_ACTIVE_FAULTS: ActiveFault[] = []

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

export function toSignals(
  sensor: SensorRow,
  variant: FaultVariantId,
): FaultSignal[] {
  // One operator-facing fault can stimulate several physical signals. Each
  // variant owns its complete suite, including each member's identity and value.
  const signalMapping = sensor.signalMapping as Partial<
    Record<FaultVariantId, readonly FaultSignal[]>
  >
  const signals = signalMapping[variant]

  if (!signals) {
    throw new Error(`${sensor.name} does not define variant "${variant}"`)
  }

  if (signals.length === 0) {
    throw new Error(
      `${sensor.name} variant "${variant}" must define at least one signal`,
    )
  }

  const signalKeys = new Set<string>()

  return signals.map((signal) => {
    const key = `${signal.cardModel}:${signal.signalId}`

    if (signalKeys.has(key)) {
      throw new Error(
        `${sensor.name} variant "${variant}" repeats signal ${key}`,
      )
    }

    signalKeys.add(key)

    // Requests get independent objects so transport code cannot mutate the
    // configured suite needed later by RemoveSignals.
    return { ...signal, signalValue: { ...signal.signalValue } }
  })
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
  // A suite counts as one fault only when the whole command is accepted.
  return (
    isResponseStatusSuccessful(response.responseStatus) &&
    response.signalErrors.length === 0
  )
}

export function isResponseStatusSuccessful(responseStatus?: ResponseStatus) {
  return responseStatus?.status === Status.SUCCESS
}

export type FaultSignal = Pick<Signal, 'signalId' | 'cardModel'> & {
  signalValue: Exclude<Signal['signalValue'], { case: undefined }>
}

export type SignalMapping<VariantId extends FaultVariantId = FaultVariantId> =
  Record<VariantId, readonly [FaultSignal, ...FaultSignal[]]>
