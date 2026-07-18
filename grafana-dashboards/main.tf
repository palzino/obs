terraform {
  backend "http" {}

  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = ">= 2.9.0"
    }
  }
}

provider "grafana" {
  alias = "grafana"

  url  = var.grafana_url
  auth = var.grafana_auth
}

resource "grafana_folder" "obs" {
  provider = grafana.grafana

  title = "obs"
}

resource "grafana_dashboard" "obs" {
  provider = grafana.grafana

  for_each    = fileset("${path.module}/dashboards/obs", "*.json")
  config_json = file("${path.module}/dashboards/obs/${each.key}")
  folder      = grafana_folder.obs.id
}
