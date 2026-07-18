# Import resources created manually (MCP / UI) before Terraform managed them.
# Safe to remove after a successful apply that shows no pending imports.

import {
  to = grafana_rule_group.obs_infrastructure
  id = "1:dfsfszt2tzpc0e:obs infrastructure"
}

import {
  to = grafana_dashboard.obs["nginx.json"]
  id = "1:obs-nginx"
}

import {
  to = grafana_dashboard.obs["guest-reconcile.json"]
  id = "1:obs-guest-reconcile"
}
