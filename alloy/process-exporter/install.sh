#!/bin/sh
# Run as root on an amd64 Linux VM, from this directory or using its full path.
set -eu

test "$(id -u)" -eq 0 || { echo 'Run as root (or sudo).' >&2; exit 1; }
test "$(uname -m)" = x86_64 || { echo 'Only amd64 is supported.' >&2; exit 1; }
if command -v systemctl >/dev/null 2>&1; then
    service_manager=systemd
elif command -v rc-service >/dev/null 2>&1; then
    service_manager=openrc
else
    echo 'systemd or OpenRC is required.' >&2
    exit 1
fi

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=0.8.7
archive="process-exporter-${version}.linux-amd64.tar.gz"
checksum=6d274cca5e94c6a25e55ec05762a472561859ce0a05b984aaedb67dd857ceee2
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
url="https://github.com/ncabatoff/process-exporter/releases/download/v${version}/${archive}"
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$work_dir/$archive"
else
    wget -q "$url" -O "$work_dir/$archive"
fi
printf '%s  %s\n' "$checksum" "$work_dir/$archive" | sha256sum -c -
tar -xzf "$work_dir/$archive" -C "$work_dir"
install -d /usr/local/bin /etc/process-exporter
install -m 0755 "$work_dir/process-exporter-${version}.linux-amd64/process-exporter" /usr/local/bin/process-exporter
install -m 0644 "$source_dir/config.yml" /etc/process-exporter/config.yml
if test "$service_manager" = systemd; then
    install -m 0644 "$source_dir/process-exporter.service" /etc/systemd/system/process-exporter.service
    systemctl daemon-reload
    systemctl enable process-exporter
    systemctl restart process-exporter
    systemctl is-active process-exporter
else
    install -m 0755 "$source_dir/process-exporter.openrc" /etc/init.d/process-exporter
    rc-update add process-exporter default
    rc-service process-exporter restart
    rc-service process-exporter status
fi
