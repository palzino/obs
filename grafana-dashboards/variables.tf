variable "grafana_url" {
  description = "Grafana instance URL"
  type        = string
}

variable "grafana_auth" {
  description = "Grafana API token or basic auth credentials"
  type        = string
  sensitive   = true
}
