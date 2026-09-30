#!/usr/bin/env bash
#
# 一键部署：拉取 GitHub Actions 构建的镜像并启动站点。
#
# 用法（在服务器上，任意目录均可）：
#   ./scripts/deploy-docker.sh              # 拉取 GHCR 最新镜像并启动
#   APP_PORT=8080 ./scripts/deploy-docker.sh
#   BUILD=1 ./scripts/deploy-docker.sh      # 本地构建镜像（不拉取）
#   PULL=0 ./scripts/deploy-docker.sh       # 不拉取，用本地已有镜像
#
# 可用环境变量：
#   IMAGE          覆盖镜像地址（默认 ghcr.io/miaopan607/qingqian-wiki:latest）
#   ENV_FILE       环境文件路径（默认 <工作目录>/.env）
#   WORK_DIR       工作目录（默认当前目录）
#   APP_PORT       对外端口，会写入 .env（默认沿用 .env 或 3103）
#   PULL / BUILD   见上方用法
#   HEALTH_RETRIES 健康检查重试次数（默认 60，间隔 2s）
#   PRUNE_IMAGES   设为 1 时清理悬挂镜像（不动数据卷）
set -Eeuo pipefail

REPO_SLUG="${REPO_SLUG:-miaopan607/qingqian-wiki}"
IMAGE="${IMAGE:-ghcr.io/${REPO_SLUG}:latest}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/${REPO_SLUG}/main}"

WORK_DIR="${WORK_DIR:-$PWD}"
ENV_FILE="${ENV_FILE:-$WORK_DIR/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$WORK_DIR/docker-compose.yml}"

PULL="${PULL:-1}"
BUILD="${BUILD:-0}"
HEALTH_RETRIES="${HEALTH_RETRIES:-60}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"
PRUNE_IMAGES="${PRUNE_IMAGES:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { printf "${GREEN}[deploy]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[deploy]${NC} %s\n" "$*"; }
error() { printf "${RED}[deploy]${NC} %s\n" "$*" >&2; }

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "缺少命令：$1"
    exit 1
  fi
}

random_hex() {
  local bytes="${1:-16}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

random_base64() {
  local bytes="${1:-48}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr -d '\n'
  else
    head -c "$bytes" /dev/urandom | base64 | tr -d '\n'
  fi
}

set_env_value() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$ENV_FILE"
  else
    printf '%s="%s"\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'
}

compose() {
  if [[ -f "$ENV_FILE" ]]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

# 在非仓库目录执行时，从仓库下载 compose 文件
ensure_compose_file() {
  if [[ -f "$COMPOSE_FILE" ]]; then
    return
  fi

  require_cmd curl
  log "未找到 docker-compose.yml，从仓库下载到 $COMPOSE_FILE"
  if ! curl -fsSL "${RAW_BASE}/docker-compose.yml" -o "$COMPOSE_FILE"; then
    error "下载 docker-compose.yml 失败，请手动下载后放到 $WORK_DIR"
    exit 1
  fi
}

# 首次部署自动生成 .env（随机密钥），已存在则沿用
ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    log "使用已有环境文件：$ENV_FILE"
  else
    local template="$WORK_DIR/.env.example"
    if [[ -f "$template" ]]; then
      cp "$template" "$ENV_FILE"
    else
      : >"$ENV_FILE"
    fi

    set_env_value JWT_SECRET "$(random_base64 48)"
    set_env_value POSTGRES_PASSWORD "$(random_hex 16)"
    chmod 600 "$ENV_FILE"
    log "已生成 $ENV_FILE（JWT_SECRET 与数据库口令为随机值）"
  fi

  if [[ -n "${APP_PORT:-}" ]]; then
    set_env_value APP_PORT "$APP_PORT"
  fi

  APP_PORT="$(read_env_value APP_PORT)"
  APP_PORT="${APP_PORT:-3103}"
  export APP_PORT
}

pull_image() {
  if [[ "$PULL" != "1" ]]; then
    log "跳过镜像拉取（PULL=$PULL）"
    return
  fi

  log "拉取镜像：$IMAGE"
  if ! APP_IMAGE="$IMAGE" compose pull app; then
    error "镜像拉取失败。若这是私有包，请先执行："
    error "  echo \"<带 read:packages 的 PAT>\" | docker login ghcr.io -u <GitHub 用户名> --password-stdin"
    error "或在源码目录改用本地构建：BUILD=1 $0"
    exit 1
  fi
}

start_stack() {
  if [[ "$BUILD" == "1" ]]; then
    log "本地构建镜像（BUILD=1，跳过拉取流程）"
    APP_IMAGE="$IMAGE" compose build app
  fi

  log "启动容器"
  APP_IMAGE="$IMAGE" compose up -d --remove-orphans
}

wait_for_health() {
  local url="http://127.0.0.1:${APP_PORT}/healthz"

  log "等待服务就绪：$url"
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
        log "健康检查通过"
        return 0
      fi
    else
      local health
      health="$(compose ps --format '{{.Health}}' app 2>/dev/null | head -1 || true)"
      if [[ "$health" == "healthy" ]]; then
        log "健康检查通过（容器状态 healthy）"
        return 0
      fi
    fi
    sleep "$HEALTH_INTERVAL"
  done

  error "等待健康检查超时，最近日志："
  compose logs --tail 60 app || true
  return 1
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  require_cmd docker
  if ! docker compose version >/dev/null 2>&1; then
    error "需要 Docker Compose v2（docker compose 子命令）"
    exit 1
  fi

  ensure_compose_file
  ensure_env_file
  pull_image
  start_stack
  wait_for_health

  compose ps

  if [[ "$PRUNE_IMAGES" == "1" ]]; then
    log "清理悬挂镜像（数据卷不受影响）"
    docker image prune -f >/dev/null
  fi

  log "部署完成：http://127.0.0.1:${APP_PORT}"
  log "首次部署请立刻打开 /setup 创建超级管理员，再对外公布地址"
}

main "$@"
