import AutorenewIcon from '@mui/icons-material/Autorenew'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DnsIcon from '@mui/icons-material/Dns'
import SensorsIcon from '@mui/icons-material/Sensors'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import type { RpcLogEntry } from './faultModel'
import { panelSx, panelTitleSx } from './faultUiStyles'

type ConnectionStatusPanelProps = {
  proxyEndpoint: string
  configError: string | null
  pendingAction: string | null
  history: RpcLogEntry[]
}

type PipelineStatus = 'ready' | 'calling' | 'success' | 'error' | 'idle'

type PipelineStep = {
  label: string
  detail: string
  status: PipelineStatus
  icon: ReactNode
}

export function ConnectionStatusPanel({
  proxyEndpoint,
  configError,
  pendingAction,
  history,
}: ConnectionStatusPanelProps) {
  const latestEntry = history[0]
  const serviceStatus = pendingAction
    ? 'calling'
    : latestEntry?.status ?? 'idle'
  const serviceDetail = pendingAction
    ? pendingAction
    : latestEntry
      ? `${latestEntry.name} ${latestEntry.durationMs}ms`
      : 'Awaiting first command'

  const pipelineSteps: PipelineStep[] = [
    {
      label: 'Browser console',
      detail: pendingAction ? 'Sending command' : 'Ready for operator action',
      status: pendingAction ? 'calling' : 'ready',
      icon: <SensorsIcon fontSize="small" />,
    },
    {
      label: 'Envoy gRPC-Web',
      detail: configError ?? proxyEndpoint,
      status: configError
        ? 'error'
        : proxyEndpoint === 'Loading configuration'
          ? 'calling'
          : 'ready',
      icon: <DnsIcon fontSize="small" />,
    },
    {
      label: 'FaultCoordinatorService',
      detail: serviceDetail,
      status: serviceStatus,
      icon: statusIcon(serviceStatus),
    },
  ]

  return (
    <Paper variant="outlined" sx={panelSx}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}
      >
        <Typography sx={panelTitleSx}>Connection path</Typography>
        <StatusChip status={serviceStatus} />
      </Stack>

      <Box
        aria-label="gRPC-Web request path"
        sx={{
          display: 'grid',
          gap: 1,
        }}
      >
        {pipelineSteps.map((step, index) => (
          <PipelineRow
            key={step.label}
            step={step}
            showConnector={index < pipelineSteps.length - 1}
          />
        ))}
      </Box>

      <Box
        sx={{
          mt: 1.5,
          p: 1.25,
          border: '1px solid #33404d',
          borderRadius: 1,
          bgcolor: '#111820',
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
          Latest exchange
        </Typography>
        {latestEntry ? (
          <Stack spacing={0.75} sx={{ mt: 0.75 }}>
            <Typography sx={{ fontWeight: 800 }}>{latestEntry.name}</Typography>
            <Stack direction="row" spacing={1} sx={{ color: '#c5d0da' }}>
              <Typography>{latestEntry.at}</Typography>
              <Typography>{latestEntry.durationMs}ms</Typography>
              <Typography>{latestEntry.status}</Typography>
            </Stack>
          </Stack>
        ) : (
          <Typography sx={{ mt: 0.75, color: '#c5d0da' }}>
            No command has been sent yet.
          </Typography>
        )}
      </Box>
    </Paper>
  )
}

function PipelineRow({
  step,
  showConnector,
}: {
  step: PipelineStep
  showConnector: boolean
}) {
  const color = statusColor(step.status)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '28px minmax(0, 1fr)',
        gap: 1,
        position: 'relative',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          justifyItems: 'center',
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid',
            borderColor: color,
            borderRadius: '50%',
            color,
            bgcolor: '#111820',
            zIndex: 1,
          }}
        >
          {step.icon}
        </Box>
        {showConnector ? (
          <Box
            sx={{
              position: 'absolute',
              top: 28,
              bottom: -8,
              left: '50%',
              width: 2,
              borderRadius: 999,
              bgcolor: '#33404d',
              transform: 'translateX(-50%)',
            }}
          />
        ) : null}
      </Box>

      <Box
        sx={{
          minWidth: 0,
          pb: showConnector ? 1 : 0,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography sx={{ fontWeight: 800 }}>{step.label}</Typography>
          <Typography sx={{ color, fontWeight: 800 }}>
            {statusLabel(step.status)}
          </Typography>
        </Stack>
        <Typography
          sx={{
            mt: 0.25,
            color: '#c5d0da',
            overflowWrap: 'anywhere',
          }}
        >
          {step.detail}
        </Typography>
      </Box>
    </Box>
  )
}

function StatusChip({ status }: { status: PipelineStatus }) {
  const color = statusColor(status)

  return (
    <Chip
      size="small"
      label={statusLabel(status)}
      sx={{
        border: '1px solid',
        borderColor: color,
        bgcolor: '#111820',
        color,
        fontWeight: 800,
      }}
    />
  )
}

function statusIcon(status: PipelineStatus) {
  if (status === 'calling') {
    return <CircularProgress color="inherit" size={16} />
  }

  if (status === 'error') {
    return <WarningAmberIcon fontSize="small" />
  }

  if (status === 'success' || status === 'ready') {
    return <CheckCircleIcon fontSize="small" />
  }

  return <AutorenewIcon fontSize="small" />
}

function statusLabel(status: PipelineStatus) {
  switch (status) {
    case 'calling':
      return 'Calling'
    case 'success':
      return 'OK'
    case 'error':
      return 'Error'
    case 'ready':
      return 'Ready'
    case 'idle':
      return 'Idle'
  }
}

function statusColor(status: PipelineStatus) {
  switch (status) {
    case 'calling':
      return '#8ae4ec'
    case 'success':
    case 'ready':
      return '#71cf84'
    case 'error':
      return '#ff8d80'
    case 'idle':
      return '#aab6c2'
  }
}
