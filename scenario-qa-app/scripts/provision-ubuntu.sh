#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then SUDO=""; else SUDO="sudo"; fi
SSH_PORT="${SSH_PORT:-22}"
DEPLOY_USER="${DEPLOY_USER:-$(id -un)}"

source /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || { printf 'DEPLOY_ENVIRONMENT_INVALID: Ubuntu is required.\n' >&2; exit 1; }

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl gnupg openssl git ufw
$SUDO install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
$SUDO chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" \
  | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
$SUDO apt-get update
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
$SUDO systemctl enable --now docker
$SUDO usermod -aG docker "$DEPLOY_USER"

$SUDO ufw default deny incoming
$SUDO ufw default allow outgoing
$SUDO ufw allow "${SSH_PORT}/tcp"
$SUDO ufw allow 80/tcp
$SUDO ufw allow 443/tcp
$SUDO ufw --force enable

printf 'Host provisioning completed. Sign out and in again for Docker group membership.\n'
printf 'Review /etc/ssh/sshd_config separately before disabling password auth; keep a second key-authenticated session open.\n'
