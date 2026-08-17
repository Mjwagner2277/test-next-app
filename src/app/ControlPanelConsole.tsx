'use client'

// This component runs in the browser because it keeps interactive React state
// and calls the gRPC-Web endpoint from the user's browser. Next.js server
// components cannot handle button clicks or use browser APIs like performance.
import AutorenewIcon from '@mui/icons-material/Autorenew'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DnsIcon from '@mui/icons-material/Dns'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import StopIcon from '@mui/icons-material/Stop'
import TerminalIcon from '@mui/icons-material/Terminal'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  List,
  ListItem,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import {
  createControlPanelClient,
  describeRpcError,
} from '@/rpc/controlPanelClient'
import type { GrpcWebBrowserConfig } from '@/rpc/config'

export function ControlPanelConsole() {
  // These are request inputs, not connection inputs. The server/proxy endpoint
  // is intentionally pulled from config so users cannot accidentally call a
  // different backend from the UI.
  const [jobId, setJobId] = useState('job-001')
  const [serviceName, setServiceName] = useState('worker')

  // pendingAction disables the buttons while a request is in flight and gives
  // the header/response panel a simple "calling" state.
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
  // on every keystroke in the job/service fields. It only changes after runtime
  // config loads or if the config endpoint returns a different value.
  const client = useMemo(
    () => (grpcWebConfig ? createControlPanelClient(grpcWebConfig) : null),
    [grpcWebConfig],
  )

  const canCall =
    pendingAction === null && client !== null && configError === null

  // All button handlers go through this wrapper so success and failure logging
  // behaves consistently across every RPC method.
  async function runRpc(name: string, call: () => Promise<unknown>) {
    const startedAt = performance.now()
    setPendingAction(name)

    try {
      const response = await call()
      appendLog({
        id: createLogId(),
        name,
        status: 'success',
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
    setHistory((current) => [entry, ...current].slice(0, 8))
  }

  function requireClient() {
    if (!client) {
      throw new Error('gRPC-Web configuration is still loading')
    }

    return client
  }

  return (
    // The page is built from MUI primitives instead of custom CSS. The sx props
    // below are local visual decisions; shared defaults live in theme.ts.
    <Box
      component="main"
      sx={{
        minHeight: '100svh',
        background:
          'linear-gradient(180deg, rgba(17, 94, 89, 0.08), transparent 320px), #f4f7f6',
      }}
    >
      <Box
        component="header"
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.84)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              py: 3.5,
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 3,
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography
                color="text.secondary"
                sx={{
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                ControlPanelService
              </Typography>
              <Typography component="h1" variant="h1">
                gRPC-Web Command Console
              </Typography>
            </Box>
            <Chip
              color={pendingAction ? 'secondary' : 'primary'}
              icon={pendingAction ? <AutorenewIcon /> : <DnsIcon />}
              label={pendingAction ? 'Calling' : 'Ready'}
              sx={{
                px: 1,
                minHeight: 40,
                fontWeight: 800,
                '& .MuiChip-icon': {
                  color: 'inherit',
                },
              }}
            />
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 } }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card variant="outlined" sx={{ boxShadow: 3 }}>
              <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                {/* Display the configured proxy as read-only review context. */}
                <Alert
                  icon={<DnsIcon />}
                  severity={configError ? 'error' : 'info'}
                  sx={{ mb: 2.5 }}
                >
                  {configError
                    ? `gRPC-Web config error: ${configError}`
                    : `Envoy gRPC-Web endpoint: ${proxyEndpoint}`}
                </Alert>

                {/* These fields become protobuf request fields for the RPCs. */}
                <Grid container spacing={2.25}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Job ID"
                      value={jobId}
                      onChange={(event) => setJobId(event.target.value)}
                      placeholder="job-001"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Service"
                      value={serviceName}
                      onChange={(event) => setServiceName(event.target.value)}
                      placeholder="worker"
                    />
                  </Grid>
                </Grid>

                <Grid
                  container
                  spacing={1.75}
                  aria-label="RPC actions"
                  sx={{ mt: 3.5 }}
                >
                  {/* Each button maps directly to one method from the .proto service. */}
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<QueryStatsIcon />}
                      onClick={() =>
                        runRpc('GetStatus', () => requireClient().getStatus({}))
                      }
                      disabled={!canCall}
                    >
                      Get status
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      color="secondary"
                      startIcon={<PlayArrowIcon />}
                      onClick={() =>
                        runRpc('StartJob', () =>
                          requireClient().startJob({ jobId }),
                        )
                      }
                      disabled={!canCall || jobId.trim().length === 0}
                    >
                      Start job
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      color="warning"
                      startIcon={<StopIcon />}
                      onClick={() =>
                        runRpc('StopJob', () =>
                          requireClient().stopJob({ jobId }),
                        )
                      }
                      disabled={!canCall || jobId.trim().length === 0}
                    >
                      Stop job
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      color="inherit"
                      startIcon={<RestartAltIcon />}
                      onClick={() =>
                        runRpc('RestartService', () =>
                          requireClient().restartService({ serviceName }),
                        )
                      }
                      disabled={!canCall || serviceName.trim().length === 0}
                      sx={{
                        bgcolor: 'text.primary',
                        color: 'background.paper',
                        '&:hover': {
                          bgcolor: '#263238',
                        },
                      }}
                    >
                      Restart service
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card
              component="aside"
              variant="outlined"
              aria-label="RPC response log"
              sx={{ minHeight: { md: 480 }, boxShadow: 3 }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Box
                  sx={{
                    mb: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                  }}
                >
                  <TerminalIcon color="action" fontSize="small" />
                  <Typography component="h2" variant="h2">
                    Responses
                  </Typography>
                </Box>

                {pendingAction ? (
                  <Alert
                    icon={<CircularProgress color="inherit" size={18} />}
                    severity="info"
                    sx={{ mb: 1.75 }}
                  >
                    {pendingAction}
                  </Alert>
                ) : null}

                {history.length === 0 ? (
                  // Empty state before the first RPC attempt.
                  <Box
                    sx={{
                      minHeight: 340,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px dashed',
                      borderColor: 'divider',
                      borderRadius: 1,
                      color: 'text.secondary',
                    }}
                  >
                    No calls yet
                  </Box>
                ) : (
                  // The response log shows either formatted protobuf responses
                  // or normalized ConnectRPC errors from describeRpcError().
                  <List disablePadding>
                    {history.map((entry, index) => (
                      <Box key={entry.id}>
                        <ListItem disableGutters sx={{ display: 'block' }}>
                          <Box
                            sx={{
                              mb: 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            {entry.status === 'success' ? (
                              <CheckCircleIcon
                                color="primary"
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
                            <Typography
                              component="time"
                              color="text.secondary"
                              sx={{ fontSize: 12 }}
                            >
                              {entry.at}
                            </Typography>
                            <Typography
                              color="text.secondary"
                              sx={{ fontSize: 12 }}
                            >
                              {entry.durationMs}ms
                            </Typography>
                          </Box>
                          <Box
                            component="pre"
                            sx={{
                              maxHeight: 220,
                              overflow: 'auto',
                              m: 0,
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: '#f7faf8',
                              color: '#20312c',
                              fontSize: 13,
                              lineHeight: 1.45,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {entry.payload}
                          </Box>
                        </ListItem>
                        {index < history.length - 1 ? <Divider /> : null}
                      </Box>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
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
