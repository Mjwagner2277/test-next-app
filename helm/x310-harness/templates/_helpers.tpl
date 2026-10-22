{{- define "x310.name" -}}
{{- printf "%s-x310" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "x310.serviceAccount" -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else if .Values.serviceAccount.create -}}
{{- include "x310.name" . -}}
{{- else -}}
{{- fail "serviceAccount.name is required when serviceAccount.create=false" -}}
{{- end -}}
{{- end -}}
