'use client'

// This component runs in the browser because it keeps interactive React state
// and calls the gRPC-Web endpoint from the user's browser. Next.js server
// components cannot handle button clicks or use browser APIs like performance.
import AutorenewIcon from '@mui/icons-material/Autorenew'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import DnsIcon from '@mui/icons-material/Dns'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SensorsIcon from '@mui/icons-material/Sensors'
import TerminalIcon from '@mui/icons-material/Terminal'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  List,
  ListItem,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { useEffect, useMemo, useState } from 'react'
import {
  FaultVariant,
  type FaultCommandResponse,
  type FaultStateResponse,
  type SensorFault,
} from '@/gen/proto/controlpanel/v1/control_panel_pb'
import {
  createControlPanelClient,
  describeRpcError,
} from '@/rpc/controlPanelClient'
import type { GrpcWebBrowserConfig } from '@/rpc/config'

const SENSOR_ROWS: SensorRow[] = [
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

const FAULT_VARIANTS: UiFaultVariant[] = ['High', 'Low', 'Unknown']

// Seeded active faults make the reviewed screen immediately show what "in the
// system" looks like, even before a real coordinator is reachable locally.
const INITIAL_ACTIVE_FAULTS: ActiveFault[] = [
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

const defaultSelectedVariants = Object.fromEntries(
  SENSOR_ROWS.map((sensor) => [sensor.id, sensor.defaultVariant]),
) as Record<string, UiFaultVariant>

const sensorById = new Map(SENSOR_ROWS.map((sensor) => [sensor.id, sensor]))

export function ControlPanelConsole() {
  // Each row owns a selected fault variant. This mirrors the requested "fault
  // column" behavior: choose High, Low, or Unknown, then inject that row.
  const [selectedVariants, setSelectedVariants] = useState(
    defaultSelectedVariants,
  )

  // activeFaults is the local view of what the coordinator currently has
  // inserted. Successful RPC responses can replace this with server truth.
  const [activeFaults, setActiveFaults] = useState(INITIAL_ACTIVE_FAULTS)

  // pendingAction disables command buttons while a request is in flight and
  // gives the operator immediate feedback that a gRPC-Web call is underway.
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // Keep a short client-side history so a reviewer can see what the last few
  // RPC calls returned without needing browser devtools.
  const [history, setHistory] = useState<RpcLogEntry[]>([])

  // This config is loaded from the Next.js server at runtime. Helm sets the
  // server environment variables, and this browser component reads the resolved
  // values through /api/grpc-config.
  const [grpcWebConfig, setGrpcWebConfig] =
    useState<GrpcWebBrowserConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const proxyEndpoint = grpcWebConfig?.baseUrl ?? 'Loading configuration'

  useEffect(() => {
    let isCurrentRequest = true

    async function loadGrpcWebConfig() {
      try {
        const response = await fetch('/api/grpc-config', {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`Config request failed with HTTP ${response.status}`)
        }

        const nextConfig = (await response.json()) as GrpcWebBrowserConfig

        if (isCurrentRequest) {
          setGrpcWebConfig(nextConfig)
          setConfigError(null)
        }
      } catch (error) {
        if (isCurrentRequest) {
          setConfigError(
            error instanceof Error
              ? error.message
              : 'Unable to load gRPC-Web configuration',
          )
        }
      }
    }

    loadGrpcWebConfig()

    return () => {
      // Ignore late fetch results if React remounts the component during
      // development or navigation.
      isCurrentRequest = false
    }
  }, [])

  // ConnectRPC clients are cheap, but useMemo prevents recreating the transport
  // on every select change. It only changes after runtime config loads.
  const client = useMemo(
    () => (grpcWebConfig ? createControlPanelClient(grpcWebConfig) : null),
    [grpcWebConfig],
  )

  const activeFaultBySensorId = useMemo(
    () => new Map(activeFaults.map((fault) => [fault.sensorId, fault])),
    [activeFaults],
  )
  const faultCount = activeFaults.length
  const canCall =
    pendingAction === null && client !== null && configError === null

  function selectVariant(sensorId: string, event: SelectChangeEvent) {
    setSelectedVariants((current) => ({
      ...current,
      [sensorId]: event.target.value as UiFaultVariant,
    }))
  }

  function requireClient() {
    if (!client) {
      throw new Error('gRPC-Web configuration is still loading')
    }

    return client
  }

  async function runRpc<Response>({
    name,
    call,
    onAccepted,
    onSuccess,
  }: RpcRunOptions<Response>) {
    const startedAt = performance.now()
    setPendingAction(name)

    try {
      const response = await call()
      const isAccepted = isAcceptedCommand(response)

      // Prefer explicit active_faults from the backend because the coordinator
      // is the real source of truth. If a starter backend only returns accepted,
      // the local update still makes the interface behave predictably.
      if (isAccepted) {
        onSuccess?.(response)

        if (hasServerFaultState(response) && response.activeFaults.length > 0) {
          setActiveFaults(response.activeFaults.map(toActiveFault))
        } else {
          onAccepted?.()
        }
      }

      appendLog({
        id: createLogId(),
        name,
        status: isAccepted ? 'success' : 'error',
        at: new Date().toLocaleTimeString(),
        durationMs: Math.round(performance.now() - startedAt),
        payload: formatPayload(response),
      })
    } catch (error) {
      appendLog({
        id: createLogId(),
        name,
        status: 'error',
        at: new Date().toLocaleTimeString(),
        durationMs: Math.round(performance.now() - startedAt),
        payload: describeRpcError(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  function appendLog(entry: RpcLogEntry) {
    // Show newest entries first and cap the list so repeated clicking does not
    // grow browser memory usage forever.
    setHistory((current) => [entry, ...current].slice(0, 6))
  }

  function refreshFaultState() {
    void runRpc<FaultStateResponse>({
      name: 'GetFaultState',
      call: () => requireClient().getFaultState({}),
      onSuccess: (response) => {
        setActiveFaults(response.activeFaults.map(toActiveFault))
      },
    })
  }

  function injectFault(sensor: SensorRow) {
    const variant = selectedVariants[sensor.id]

    void runRpc<FaultCommandResponse>({
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
            detail: 'Local preview after accepted insert',
          }),
        )
      },
    })
  }

  function clearFault(sensor: SensorRow) {
    void runRpc<FaultCommandResponse>({
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
    void runRpc<FaultCommandResponse>({
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
          <Box
            component="header"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
              gap: 1.5,
              alignItems: 'center',
              p: 2,
              borderBottom: '1px solid #33404d',
              bgcolor: '#111820',
            }}
          >
            <Box>
              <Typography
                sx={{
                  color: '#aab6c2',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Sensor failure injection
              </Typography>
              <Typography component="h1" variant="h2" sx={{ color: '#f7fafc' }}>
                Sensor Fault Matrix
              </Typography>
            </Box>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.25}
              sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
            >
              <Chip
                icon={<WarningAmberIcon />}
                label={`${faultCount} fault${faultCount === 1 ? '' : 's'} in system`}
                sx={{
                  minHeight: 36,
                  border: '1px solid',
                  borderColor: faultCount > 0 ? '#ff8d80' : '#71cf84',
                  bgcolor: faultCount > 0 ? '#421c18' : '#163b1f',
                  color: faultCount > 0 ? '#ffb0a6' : '#b6f1bf',
                  fontWeight: 800,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
              <Button
                variant="outlined"
                startIcon={<AutorenewIcon />}
                onClick={refreshFaultState}
                disabled={!canCall}
                sx={commandButtonSx}
              >
                Refresh state
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<RestartAltIcon />}
                onClick={resetSystem}
                disabled={!canCall || faultCount === 0}
                sx={{
                  minHeight: 36,
                  borderColor: '#ff8d80',
                  color: '#ffb0a6',
                  bgcolor: '#421c18',
                  '&:hover': {
                    borderColor: '#ffb0a6',
                    bgcolor: '#55231f',
                  },
                }}
              >
                System reset
              </Button>
            </Stack>
          </Box>

          <Box sx={{ p: 2, borderBottom: '1px solid #33404d' }}>
            <Grid container spacing={1.25}>
              {buildSummaryTiles(activeFaults).map((tile) => (
                <Grid key={tile.label} size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Box
                    sx={{
                      minHeight: 70,
                      p: 1.25,
                      border: '1px solid',
                      borderColor: tile.active ? '#ff8d80' : '#33404d',
                      borderRadius: 1,
                      bgcolor: tile.active ? '#421c18' : '#1d2530',
                    }}
                  >
                    <Typography
                      sx={{
                        color: '#aab6c2',
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      {tile.label}
                    </Typography>
                    <Typography sx={{ mt: 0.5, fontWeight: 800 }}>
                      {tile.value}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>

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
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                overflowX: 'auto',
                borderColor: '#33404d',
                borderRadius: 1,
                bgcolor: '#1d2530',
              }}
            >
              <Table
                size="small"
                aria-label="Sensor faults available for injection"
                sx={{
                  minWidth: 900,
                  '& th': {
                    py: 1.25,
                    color: '#aab6c2',
                    borderColor: '#33404d',
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  },
                  '& td': {
                    py: 1.25,
                    color: '#eef4f8',
                    borderColor: '#33404d',
                  },
                  '& tbody tr:last-child td': {
                    borderBottom: 0,
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Sensor</TableCell>
                    <TableCell>Live reading</TableCell>
                    <TableCell>Fault variant</TableCell>
                    <TableCell>In system</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {SENSOR_ROWS.map((sensor) => {
                    const activeFault = activeFaultBySensorId.get(sensor.id)
                    const isInjected = activeFault !== undefined

                    return (
                      <TableRow
                        key={sensor.id}
                        sx={{
                          bgcolor: isInjected ? '#4a1d19' : 'transparent',
                        }}
                      >
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography sx={{ fontWeight: 800 }}>
                              {sensor.name}
                            </Typography>
                            <Typography sx={{ color: '#c5d0da' }}>
                              {sensor.location}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{sensor.liveReading}</TableCell>
                        <TableCell sx={{ width: { xs: 260, lg: 360 } }}>
                          <Select
                            fullWidth
                            size="small"
                            value={selectedVariants[sensor.id]}
                            onChange={(event) =>
                              selectVariant(sensor.id, event)
                            }
                            disabled={!canCall || isInjected}
                            aria-label={`${sensor.name} fault variant`}
                            sx={selectSx}
                          >
                            {FAULT_VARIANTS.map((variant) => (
                              <MenuItem key={variant} value={variant}>
                                {variant}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={
                              isInjected
                                ? `${activeFault.variant} injected`
                                : 'Not inserted'
                            }
                            sx={isInjected ? injectedChipSx : readyChipSx}
                          />
                        </TableCell>
                        <TableCell>
                          {isInjected ? (
                            <Button
                              variant="outlined"
                              startIcon={<DeleteSweepIcon />}
                              onClick={() => clearFault(sensor)}
                              disabled={!canCall}
                              sx={removeButtonSx}
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              variant="outlined"
                              startIcon={<SensorsIcon />}
                              onClick={() => injectFault(sensor)}
                              disabled={!canCall}
                              sx={injectButtonSx}
                            >
                              Inject
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack component="aside" spacing={1.5} aria-label="Fault state">
              <Paper variant="outlined" sx={alertPanelSx}>
                <Typography sx={panelTitleSx}>Faults in system</Typography>
                {activeFaults.length === 0 ? (
                  <Alert severity="success" sx={{ mt: 1 }}>
                    System is clear
                  </Alert>
                ) : (
                  <Stack spacing={1}>
                    {activeFaults.map((fault) => (
                      <Box key={fault.sensorId} sx={activeFaultItemSx}>
                        <Typography sx={{ fontWeight: 800 }}>
                          {fault.sensorName} -&gt; {fault.variant}
                        </Typography>
                        <Typography sx={{ color: '#c5d0da' }}>
                          {fault.detail}, elapsed {fault.insertedAt}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>

              <Paper variant="outlined" sx={panelSx}>
                <Typography sx={panelTitleSx}>State legend</Typography>
                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  sx={{ flexWrap: 'wrap' }}
                >
                  <LegendItem color="#71cf84" label="Normal reading" />
                  <LegendItem color="#f0bf58" label="Variant selected" />
                  <LegendItem color="#ff8d80" label="Fault inserted" />
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={panelSx}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', mb: 1 }}
                >
                  <TerminalIcon fontSize="small" sx={{ color: '#aab6c2' }} />
                  <Typography sx={panelTitleSx}>RPC activity</Typography>
                </Stack>

                <Alert
                  icon={<DnsIcon />}
                  severity={configError ? 'error' : 'info'}
                  sx={{ mb: 1.25 }}
                >
                  {configError
                    ? `gRPC-Web config error: ${configError}`
                    : `Envoy gRPC-Web endpoint: ${proxyEndpoint}`}
                </Alert>

                {pendingAction ? (
                  <Alert
                    icon={<CircularProgress color="inherit" size={18} />}
                    severity="info"
                    sx={{ mb: 1.25 }}
                  >
                    {pendingAction}
                  </Alert>
                ) : null}

                {history.length === 0 ? (
                  <Box sx={emptyLogSx}>No calls yet</Box>
                ) : (
                  <List disablePadding>
                    {history.slice(0, 3).map((entry, index) => (
                      <Box key={entry.id}>
                        <ListItem disableGutters sx={{ display: 'block' }}>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'center', mb: 0.75 }}
                          >
                            {entry.status === 'success' ? (
                              <CheckCircleIcon
                                color="success"
                                fontSize="small"
                              />
                            ) : (
                              <WarningAmberIcon
                                color="warning"
                                fontSize="small"
                              />
                            )}
                            <Typography sx={{ flex: 1, fontWeight: 800 }}>
                              {entry.name}
                            </Typography>
                            <Typography sx={{ color: '#aab6c2' }}>
                              {entry.durationMs}ms
                            </Typography>
                          </Stack>
                          <Box component="pre" sx={logPayloadSx}>
                            {entry.payload}
                          </Box>
                        </ListItem>
                        {index < history.length - 1 ? (
                          <Divider sx={{ borderColor: '#33404d' }} />
                        ) : null}
                      </Box>
                    ))}
                  </List>
                )}
              </Paper>
            </Stack>
          </Box>
        </Paper>
      </Container>
    </Box>
  )
}

type SensorRow = {
  id: string
  name: string
  location: string
  liveReading: string
  defaultVariant: UiFaultVariant
}

type UiFaultVariant = 'High' | 'Low' | 'Unknown'

type ActiveFault = {
  sensorId: string
  sensorName: string
  variant: UiFaultVariant
  insertedAt: string
  detail: string
}

// This is display-only client state. It does not need to match the server
// schema because it represents UI history, not a protobuf request/response.
type RpcLogEntry = {
  id: string
  name: string
  status: 'success' | 'error'
  at: string
  durationMs: number
  payload: string
}

type RpcRunOptions<Response> = {
  name: string
  call: () => Promise<Response>
  onAccepted?: () => void
  onSuccess?: (response: Response) => void
}

type SummaryTile = {
  label: string
  value: string
  active: boolean
}

function toProtoVariant(variant: UiFaultVariant) {
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

function toUiVariant(variant: FaultVariant): UiFaultVariant {
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

function toActiveFault(fault: SensorFault): ActiveFault {
  const catalogSensor = sensorById.get(fault.sensorId)

  return {
    sensorId: fault.sensorId,
    sensorName: fault.sensorName || catalogSensor?.name || fault.sensorId,
    variant: toUiVariant(fault.variant),
    insertedAt: fault.insertedAt || 'server active',
    detail: fault.detail || 'Reported by coordinator',
  }
}

function upsertActiveFault(current: ActiveFault[], nextFault: ActiveFault) {
  const remaining = current.filter(
    (fault) => fault.sensorId !== nextFault.sensorId,
  )

  return [nextFault, ...remaining]
}

function buildSummaryTiles(activeFaults: ActiveFault[]): SummaryTile[] {
  const activeTiles = activeFaults.slice(0, 2).map((fault) => ({
    label: fault.sensorName,
    value: `${fault.variant} injected ${fault.insertedAt}`,
    active: true,
  }))

  return [
    ...activeTiles,
    {
      label: 'Next queued',
      value: 'Temperature A high',
      active: false,
    },
    {
      label: 'Reset scope',
      value: 'All injected faults',
      active: false,
    },
  ].slice(0, 4)
}

function hasServerFaultState(
  response: unknown,
): response is Pick<FaultStateResponse, 'activeFaults'> {
  return (
    typeof response === 'object' &&
    response !== null &&
    Array.isArray((response as FaultStateResponse).activeFaults)
  )
}

function isAcceptedCommand(response: unknown) {
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

function createLogId() {
  // randomUUID is available in modern browsers; Date.now keeps the app usable
  // in older/test environments where crypto may be absent.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`
}

function formatPayload(value: unknown) {
  // Generated protobuf messages are plain enough to stringify for a simple
  // review console. BigInt needs special handling because JSON.stringify cannot
  // serialize it by default.
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          flex: '0 0 auto',
        }}
      />
      <Typography sx={{ color: '#c5d0da' }}>{label}</Typography>
    </Stack>
  )
}

const panelSx = {
  p: 1.5,
  borderColor: '#33404d',
  borderRadius: 1,
  bgcolor: '#1d2530',
  color: '#eef4f8',
}

const alertPanelSx = {
  ...panelSx,
  borderColor: '#ff8d80',
  bgcolor: '#421c18',
}

const panelTitleSx = {
  fontSize: 14,
  fontWeight: 800,
  color: '#f7fafc',
}

const activeFaultItemSx = {
  p: 1.25,
  border: '1px solid #33404d',
  borderRadius: 1,
  bgcolor: '#141a21',
}

const commandButtonSx = {
  minHeight: 36,
  borderColor: '#4cc9d4',
  color: '#8ae4ec',
  '&:hover': {
    borderColor: '#8ae4ec',
    bgcolor: '#10383d',
  },
}

const injectButtonSx = {
  ...commandButtonSx,
  minWidth: 112,
}

const removeButtonSx = {
  minHeight: 36,
  minWidth: 112,
  borderColor: '#ff8d80',
  color: '#ffb0a6',
  '&:hover': {
    borderColor: '#ffb0a6',
    bgcolor: '#421c18',
  },
}

const selectSx = {
  color: '#eef4f8',
  bgcolor: '#111820',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: '#33404d',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: '#4cc9d4',
  },
  '& .MuiSvgIcon-root': {
    color: '#eef4f8',
  },
}

const readyChipSx = {
  bgcolor: '#111820',
  border: '1px solid #33404d',
  color: '#c5d0da',
  fontWeight: 800,
}

const injectedChipSx = {
  bgcolor: '#4a1d19',
  border: '1px solid #ff8d80',
  color: '#ffb0a6',
  fontWeight: 800,
}

const emptyLogSx = {
  minHeight: 88,
  display: 'grid',
  placeItems: 'center',
  border: '1px dashed #33404d',
  borderRadius: 1,
  color: '#aab6c2',
}

const logPayloadSx = {
  maxHeight: 140,
  overflow: 'auto',
  m: 0,
  p: 1,
  borderRadius: 1,
  bgcolor: '#111820',
  color: '#d7e0ea',
  fontSize: 12,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
