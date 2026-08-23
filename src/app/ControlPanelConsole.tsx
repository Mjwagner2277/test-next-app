'use client'

// This component is intentionally the coordinator for the page, not the whole
// UI. Protocol-specific rendering lives under src/features/faults, while
// transport setup lives under src/rpc. That gives the app room to grow into
// additional gRPC APIs or other protocols without returning to one giant file.
import { Box, Container, Paper } from '@mui/material'
import { useMemo, useState } from 'react'
import { FaultConsoleHeader } from '@/features/faults/FaultConsoleHeader'
import { FaultStateAside } from '@/features/faults/FaultStateAside'
import { SensorFaultMatrix } from '@/features/faults/SensorFaultMatrix'
import {
  FAULT_VARIANTS,
  INITIAL_ACTIVE_FAULTS,
  SENSOR_ROWS,
  defaultSelectedVariants,
  isAcceptedCommand,
  toProtoVariant,
  upsertActiveFault,
  type RpcRunOptions,
  type SensorRow,
  type UiFaultVariant,
} from '@/features/faults/faultModel'
import {
  createFaultCoordinatorClient,
  describeRpcError,
} from '@/rpc/faultCoordinatorClient'
import { useGrpcWebConfig } from '@/rpc/useGrpcWebConfig'

export function ControlPanelConsole() {
  // Each row owns a selected fault variant. This mirrors the requested "fault
  // column" behavior: choose High, Low, or Unknown, then inject that row.
  const [selectedVariants, setSelectedVariants] = useState(
    defaultSelectedVariants,
  )

  // activeFaults is local browser state. The current proto only returns command
  // SUCCESS/FAILURE, so this page cannot rehydrate active faults from the
  // coordinator after a reload.
  const [activeFaults, setActiveFaults] = useState(INITIAL_ACTIVE_FAULTS)

  // pendingAction disables command buttons while a request is in flight and
  // gives the operator immediate feedback that a gRPC-Web call is underway.
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const { grpcWebConfig, configError } = useGrpcWebConfig()

  // ConnectRPC clients are cheap, but useMemo prevents recreating the transport
  // on every select change. It only changes after runtime config loads.
  const client = useMemo(
    () =>
      grpcWebConfig ? createFaultCoordinatorClient(grpcWebConfig) : null,
    [grpcWebConfig],
  )

  const activeFaultBySensorId = useMemo(
    () => new Map(activeFaults.map((fault) => [fault.sensorId, fault])),
    [activeFaults],
  )
  const faultCount = activeFaults.length
  const canCall =
    pendingAction === null && client !== null && configError === null

  function selectVariant(sensorId: string, variant: UiFaultVariant) {
    setSelectedVariants((current) => ({
      ...current,
      [sensorId]: variant,
    }))
  }

  function requireClient() {
    if (!client) {
      throw new Error('gRPC-Web configuration is still loading')
    }

    return client
  }

  async function runRpc({
    name,
    call,
    onAccepted,
  }: RpcRunOptions) {
    setPendingAction(name)

    try {
      const response = await call()
      const isAccepted = isAcceptedCommand(response)

      // The backend response is intentionally small: a command result enum. When
      // it reports SUCCESS, the browser updates its local "in system" display.
      // FAILURE leaves the existing display untouched.
      if (isAccepted) {
        onAccepted?.()
      }
    } catch (error) {
      globalThis.console.warn(`${name} failed: ${describeRpcError(error)}`)
    } finally {
      setPendingAction(null)
    }
  }

  function injectFault(sensor: SensorRow) {
    const variant = selectedVariants[sensor.id]

    void runRpc({
      name: `Inject ${sensor.name} ${variant}`,
      call: () =>
        requireClient().injectSensorFault({
          sensorId: sensor.id,
          sensorName: sensor.name,
          variant: toProtoVariant(variant),
        }),
      onAccepted: () => {
        setActiveFaults((current) =>
          upsertActiveFault(current, {
            sensorId: sensor.id,
            sensorName: sensor.name,
            variant,
            insertedAt: 'just now',
            detail: 'Accepted by coordinator',
          }),
        )
      },
    })
  }

  function clearFault(sensor: SensorRow) {
    void runRpc({
      name: `Clear ${sensor.name}`,
      call: () => requireClient().clearSensorFault({ sensorId: sensor.id }),
      onAccepted: () => {
        setActiveFaults((current) =>
          current.filter((fault) => fault.sensorId !== sensor.id),
        )
      },
    })
  }

  function resetSystem() {
    void runRpc({
      name: 'ResetSystem',
      call: () =>
        requireClient().resetSystem({ scope: 'ALL_INJECTED_SENSOR_FAULTS' }),
      onAccepted: () => setActiveFaults([]),
    })
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100svh',
        bgcolor: '#0f151c',
        color: '#eef4f8',
        px: { xs: 1, md: 2.5 },
        py: { xs: 1, md: 2 },
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: 2200, mx: 'auto', px: 0 }}>
        <Paper
          variant="outlined"
          sx={{
            overflow: 'hidden',
            borderColor: '#33404d',
            borderRadius: 1,
            bgcolor: '#141a21',
            color: 'inherit',
          }}
        >
          <FaultConsoleHeader
            faultCount={faultCount}
            canCall={canCall}
            onResetSystem={resetSystem}
          />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                lg: 'minmax(0, 3fr) minmax(340px, 1fr)',
              },
              gap: 2,
              p: 2,
            }}
          >
            <SensorFaultMatrix
              sensors={SENSOR_ROWS}
              variants={FAULT_VARIANTS}
              selectedVariants={selectedVariants}
              activeFaultBySensorId={activeFaultBySensorId}
              canCall={canCall}
              onSelectVariant={selectVariant}
              onInjectFault={injectFault}
              onClearFault={clearFault}
            />

            <FaultStateAside
              activeFaults={activeFaults}
              sensors={SENSOR_ROWS}
              variants={FAULT_VARIANTS}
              selectedVariants={selectedVariants}
            />
          </Box>
        </Paper>
      </Container>
    </Box>
  )
}
