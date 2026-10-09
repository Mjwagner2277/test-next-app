import assert from 'node:assert/strict'
import test from 'node:test'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { createClient, createRouterTransport } from '@connectrpc/connect'
import {
  CardModel,
  SignalStimService,
  SignalsRequestSchema,
  SignalsResponseSchema,
  Status,
  type SignalsRequest,
} from '../src/gen/proto/controlpanel/v1/control_panel_pb'
import {
  SENSOR_ROWS,
  isSignalsResponseSuccessful,
  toSignals,
  upsertActiveFault,
  type ActiveFault,
  type FaultSignal,
  type SensorRow,
} from '../src/features/faults/faultModel'

function conflictRow(): SensorRow {
  return {
    id: 'sensor-conflict',
    name: 'Sensor conflict',
    location: 'Zone 1',
    liveReading: 'Normal',
    faultClassId: 'threshold',
    defaultVariant: 'high',
    signalMapping: {
      high: [
        {
          signalId: 18446744073709551615n,
          cardModel: CardModel.TYPE1,
          signalValue: { case: 'analog', value: 0 },
        },
        {
          signalId: 18446744073709551615n,
          cardModel: CardModel.TYPE2,
          signalValue: { case: 'discrete', value: false },
        },
        {
          signalId: 3003n,
          cardModel: CardModel.TYPE2,
          signalValue: { case: 'serial', value: 'sensor conflict: A ≠ B' },
        },
      ],
      low: [
        {
          signalId: 4001n,
          cardModel: CardModel.TYPE1,
          signalValue: { case: 'analog', value: 17 },
        },
        {
          signalId: 4002n,
          cardModel: CardModel.TYPE2,
          signalValue: { case: 'discrete', value: true },
        },
      ],
    },
  }
}

function signalData(request: SignalsRequest): FaultSignal[] {
  return request.signals.map(({ signalId, cardModel, signalValue }) => {
    assert.notEqual(signalValue.case, undefined)
    return { signalId, cardModel, signalValue } as FaultSignal
  })
}

test('existing fault choices retain their singleton signal payloads', () => {
  const temperature = SENSOR_ROWS.find((row) => row.id === 'temperature-a')!
  const interlock = SENSOR_ROWS.find((row) => row.id === 'interlock-b')!

  assert.deepEqual(toSignals(temperature, 'high'), [
    {
      signalId: 1001n,
      cardModel: CardModel.TYPE1,
      signalValue: { case: 'analog', value: 4095 },
    },
  ])
  assert.deepEqual(toSignals(temperature, 'low'), [
    {
      signalId: 1001n,
      cardModel: CardModel.TYPE1,
      signalValue: { case: 'analog', value: 0 },
    },
  ])
  assert.deepEqual(toSignals(interlock, 'open'), [
    {
      signalId: 2001n,
      cardModel: CardModel.TYPE2,
      signalValue: { case: 'discrete', value: false },
    },
  ])
  assert.deepEqual(toSignals(interlock, 'shut'), [
    {
      signalId: 2001n,
      cardModel: CardModel.TYPE2,
      signalValue: { case: 'discrete', value: true },
    },
  ])
})

test('each fault choice can use its own complete signal set', () => {
  const sensor = conflictRow()
  assert.equal(sensor.faultClassId, 'threshold')
  const high = toSignals(sensor, 'high')
  const low = toSignals(sensor, 'low')

  assert.equal(high.length, 3)
  assert.equal(low.length, 2)
  assert.deepEqual(high, sensor.signalMapping.high)
  assert.deepEqual(low, sensor.signalMapping.low)
  assert.deepEqual(low.map((signal) => signal.signalId), [4001n, 4002n])
  // Identical signal IDs on different cards are distinct signal addresses.
  assert.equal(high[0].signalId, high[1].signalId)
  assert.notEqual(high[0].cardModel, high[1].cardModel)
})

test('requests do not share mutable signals or oneof values with configuration', () => {
  const sensor = conflictRow()
  assert.equal(sensor.faultClassId, 'threshold')
  const first = toSignals(sensor, 'high')
  const second = toSignals(sensor, 'high')

  assert.notStrictEqual(first, sensor.signalMapping.high)
  assert.notStrictEqual(first, second)
  for (let i = 0; i < first.length; i++) {
    assert.notStrictEqual(first[i], sensor.signalMapping.high[i])
    assert.notStrictEqual(first[i], second[i])
    assert.notStrictEqual(first[i].signalValue, sensor.signalMapping.high[i].signalValue)
    assert.notStrictEqual(first[i].signalValue, second[i].signalValue)
  }

  first[0].signalId = 1n
  first[0].signalValue.value = 25
  first.pop()
  assert.deepEqual(second, sensor.signalMapping.high)
  assert.deepEqual(toSignals(sensor, 'high'), second)
})

test('protobuf preserves all grouped signals, 64-bit IDs, false, zero, and serial text', () => {
  const signals = toSignals(conflictRow(), 'high')
  const encoded = toBinary(SignalsRequestSchema, create(SignalsRequestSchema, { signals }))
  const decoded = fromBinary(SignalsRequestSchema, encoded)

  assert.deepEqual(signalData(decoded), signals)
})

test('both set and remove RPCs carry the full selected group in one request', async () => {
  const received: { method: string; signals: FaultSignal[] }[] = []
  const transport = createRouterTransport((router) => {
    router.service(SignalStimService, {
      setSignal(request) {
        received.push({ method: 'set', signals: signalData(request) })
        return { responseStatus: { status: Status.SUCCESS } }
      },
      removeSignals(request) {
        received.push({ method: 'remove', signals: signalData(request) })
        return { responseStatus: { status: Status.SUCCESS } }
      },
    })
  })
  const client = createClient(SignalStimService, transport)
  const sensor = conflictRow()

  const setResponse = await client.setSignal({ signals: toSignals(sensor, 'high') })
  const removeResponse = await client.removeSignals({ signals: toSignals(sensor, 'high') })

  assert.equal(isSignalsResponseSuccessful(setResponse), true)
  assert.equal(isSignalsResponseSuccessful(removeResponse), true)
  assert.deepEqual(received, [
    { method: 'set', signals: toSignals(sensor, 'high') },
    { method: 'remove', signals: toSignals(sensor, 'high') },
  ])
})

test('a variant not offered by a row is rejected', () => {
  assert.throws(() => toSignals(conflictRow(), 'open'))
})

test('an invalid empty signal group is rejected before an RPC can be sent', () => {
  const sensor = conflictRow()
  const invalid = { ...sensor, signalMapping: { high: [], low: [] } } as unknown as SensorRow
  assert.throws(() => toSignals(invalid, 'high'))
})

test('a signal address cannot occur twice in one group, even with different values', () => {
  const sensor = conflictRow()
  const signal = toSignals(sensor, 'high')[0]
  const invalid = {
    ...sensor,
    signalMapping: {
      high: [signal, { ...signal, signalValue: { case: 'analog', value: 4095 } }],
      low: [signal],
    },
  } as SensorRow

  assert.throws(() => toSignals(invalid, 'high'))
})

test('a grouped command succeeds only when every signal is accepted', () => {
  assert.equal(isSignalsResponseSuccessful(create(SignalsResponseSchema, {
    responseStatus: { status: Status.SUCCESS },
  })), true)
  assert.equal(isSignalsResponseSuccessful(create(SignalsResponseSchema, {
    responseStatus: { status: Status.FAILURE },
  })), false)
  assert.equal(isSignalsResponseSuccessful(create(SignalsResponseSchema)), false)
  assert.equal(isSignalsResponseSuccessful(create(SignalsResponseSchema, {
    responseStatus: { status: Status.SUCCESS },
    signalErrors: [{
      signal: toSignals(conflictRow(), 'high')[1],
      signalErrors: ['The second sensor rejected the override'],
    }],
  })), false)
})

test('a fault group occupies one active row when its selected choice changes', () => {
  const sensor = conflictRow()
  const other: ActiveFault = {
    sensorId: 'temperature-a', variant: 'high', insertedAt: 'earlier', detail: 'Accepted',
  }
  const high: ActiveFault = {
    sensorId: sensor.id, variant: 'high', insertedAt: 'now', detail: 'Accepted',
  }
  const low: ActiveFault = { ...high, variant: 'low' }
  const initial = [other]
  const afterHigh = upsertActiveFault(initial, high)
  const afterLow = upsertActiveFault(afterHigh, low)

  assert.equal(toSignals(sensor, 'high').length, 3)
  assert.equal(toSignals(sensor, 'low').length, 2)
  assert.deepEqual(afterHigh, [high, other])
  assert.deepEqual(afterLow, [low, other])
  assert.deepEqual(initial, [other])
})
