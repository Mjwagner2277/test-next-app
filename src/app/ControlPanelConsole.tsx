'use client'

// This component is intentionally the coordinator for the page, not the whole
// UI. Protocol-specific rendering lives under src/features/faults, while
// transport setup lives under src/rpc. That gives the app room to grow into
// additional gRPC APIs or other protocols without returning to one giant file.
import { Alert, AlertTitle, Box, Container, Paper, Snackbar } from '@mui/material'
import { useMemo, useState } from 'react'
import { FaultConsoleHeader } from '@/features/faults/FaultConsoleHeader'
import { FaultStateAside } from '@/features/faults/FaultStateAside'
import { SensorFaultMatrix } from '@/features/faults/SensorFaultMatrix'
import {
  INITIAL_ACTIVE_FAULTS,
  SENSOR_ROWS,
  defaultSelectedVariants,
  getSelectedFaultVariant,
  getFaultVariantLabel,
  isResponseStatusSuccessful,
  isSignalsResponseSuccessful,
  toSignals,
  upsertActiveFault,
  type FaultVariantId,
  type RpcRunOptions,
  type SensorRow,
} from '@/features/faults/faultModel'
import {
  createSignalStimClient,
  describeRpcError,
} from '@/rpc/faultCoordinatorClient'

type CommandFailureNotice = {
  action: string
  detail: string
}

export function ControlPanelConsole() {
  // Each row owns a selected fault variant. The valid values now come from the
  // row's fault class, so one row can offer High/Low while another offers
  // Open/Shut or Engaged/Disengaged.
  const [selectedVariants, setSelectedVariants] = useState(
    defaultSelectedVariants,
  )

  // activeFaults is local browser state. The current proto only returns command
  // SUCCESS/FAILURE, so this page cannot rehydrate active faults from the
  // coordinator after a reload.
  const [activeFaults, setActiveFaults] = useState(INITIAL_ACTIVE_FAULTS)

  // A failed batch or lost response can leave signals applied even when no
  // complete fault was accepted. Keep the existing Reset action available.
  const [faultStateUncertain, setFaultStateUncertain] = useState(false)

  // pendingAction disables command buttons while a request is in flight and
  // gives the operator immediate feedback that a gRPC-Web call is underway.
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // Failed commands should be visible to the operator. A missing backend,
  // rejected command, or Envoy routing issue should not silently look like an
  // ignored button press.
  const [commandFailure, setCommandFailure] =
    useState<CommandFailureNotice | null>(null)

  // ConnectRPC clients are cheap, but useMemo prevents recreating the transport
  // on every select change. The client uses same-origin routing: Next.js logs
  // gRPC-Web calls on the server and relays them to the configured Envoy endpoint.
  const client = useMemo(() => createSignalStimClient(), [])

  const activeFaultBySensorId = useMemo(
    () => new Map(activeFaults.map((fault) => [fault.sensorId, fault])),
    [activeFaults],
  )
  const faultCount = activeFaults.length
  const canCall = pendingAction === null

  function selectVariant(sensorId: string, variant: FaultVariantId) {
    setSelectedVariants((current) => ({
      ...current,
      [sensorId]: variant,
    }))
  }

  function requireClient() {
    return client
  }

  async function runRpc<Response>({
    name,
    call,
    isSuccessful,
    onSuccess,
  }: RpcRunOptions<Response>) {
    setPendingAction(name)
    setCommandFailure(null)

    try {
      const response = await call()
      const commandSucceeded = isSuccessful(response)

      // Each RPC response shape owns its own success check. This keeps reset's
      // bare ResponseStatus from leaking into the fault-command response path.
      if (commandSucceeded) {
        onSuccess?.()
      } else {
        setFaultStateUncertain(true)
        setCommandFailure({
          action: name,
          detail:
            'The coordinator did not accept the full command. Local fault state was not changed. Use Reset faults to clear any signals that may have been applied.',
        })
      }
    } catch (error) {
      const detail = describeRpcError(error)

      setFaultStateUncertain(true)
      setCommandFailure({
        action: name,
        detail: `${detail}. Use Reset faults to clear any signals that may have been applied.`,
      })
      globalThis.console.warn(`${name} failed: ${detail}`)
    } finally {
      setPendingAction(null)
    }
  }

  function clearCommandFailure() {
    setCommandFailure(null)
  }

  function injectFault(sensor: SensorRow) {
    const variant = getSelectedFaultVariant(sensor, selectedVariants)
    const variantLabel = getFaultVariantLabel(sensor, variant)

    void runRpc({
      name: `Inject ${sensor.name} ${variantLabel}`,
      call: () =>
        requireClient().setSignal({
          signals: toSignals(sensor, variant),
        }),
      isSuccessful: isSignalsResponseSuccessful,
      onSuccess: () => {
        setActiveFaults((current) =>
          upsertActiveFault(current, {
            sensorId: sensor.id,
            variant,
            insertedAt: 'just now',
            detail: 'Accepted by coordinator',
          }),
        )
      },
    })
  }

  function clearFault(sensor: SensorRow) {
    const activeVariant =
      activeFaultBySensorId.get(sensor.id)?.variant ??
      getSelectedFaultVariant(sensor, selectedVariants)

    void runRpc({
      name: `Clear ${sensor.name}`,
      call: () =>
        requireClient().removeSignals({
          signals: toSignals(sensor, activeVariant),
        }),
      isSuccessful: isSignalsResponseSuccessful,
      onSuccess: () => {
        setActiveFaults((current) =>
          current.filter((fault) => fault.sensorId !== sensor.id),
        )
      },
    })
  }

  function resetFaults() {
    void runRpc({
      name: 'Reset faults',
      call: () => requireClient().resetAll({}),
      isSuccessful: isResponseStatusSuccessful,
      onSuccess: () => {
        setActiveFaults([])
        setFaultStateUncertain(false)
      },
    })
  }

  function resetSystem() {
    // Intentionally blank until the proto exposes a system reset RPC.
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
            canResetFaults={canCall && (faultCount > 0 || faultStateUncertain)}
            isBusy={pendingAction !== null}
            onResetFaults={resetFaults}
            onResetSystem={resetSystem}
          />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                // Keep the fault state panel beside the matrix on normal
                // laptop/tablet widths. Only phones stack the aside below.
                sm: 'minmax(0, 1fr) minmax(240px, 280px)',
                lg: 'minmax(0, 3fr) minmax(320px, 1fr)',
              },
              alignItems: 'start',
              gap: { xs: 1.25, sm: 1.5, lg: 2 },
              p: { xs: 1, sm: 1.5, lg: 2 },
            }}
          >
            <SensorFaultMatrix
              sensors={SENSOR_ROWS}
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
              selectedVariants={selectedVariants}
            />
          </Box>
        </Paper>
      </Container>
      <Snackbar
        open={commandFailure !== null}
        onClose={clearCommandFailure}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={clearCommandFailure}
          sx={{
            alignItems: 'center',
            border: '1px solid #f0bf58',
            bgcolor: '#5a3510',
            color: '#fff7df',
            maxWidth: { xs: 'calc(100vw - 32px)', sm: 560 },
            '& .MuiAlert-icon': {
              color: '#ffd98a',
            },
          }}
        >
          <AlertTitle sx={{ color: 'inherit', fontWeight: 800 }}>
            Command failed
          </AlertTitle>
          {commandFailure
            ? `${commandFailure.action}: ${commandFailure.detail}`
            : ''}
        </Alert>
      </Snackbar>
    </Box>
  )
}
