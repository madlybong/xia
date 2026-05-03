#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# XIA_MANAGER.sh — XIA Infrastructure Manager v1.0.0
# Repo: https://github.com/madlybong/xia.git
#
# Usage:
#   sudo ./XIA_MANAGER.sh              → Interactive menu
#   sudo ./XIA_MANAGER.sh --install    → Non-interactive install
#   sudo ./XIA_MANAGER.sh --uninstall  → Non-interactive uninstall
#   sudo ./XIA_MANAGER.sh --check      → Health check (exit 0=pass, 1=fail)
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail

# ── CONSTANTS ─────────────────────────────────────────────────────────
readonly XIA_VERSION="1.0.0"
readonly XIA_REPO="https://github.com/madlybong/xia.git"
readonly XIA_USER="xia"
readonly XIA_SECRETS_DIR="/etc/xia/secrets"
readonly XIA_CONFIG_DIR="/etc/xia/config"
readonly QDRANT_BIN="/usr/local/bin/qdrant"
readonly QDRANT_DATA_DIR="/var/lib/qdrant"
readonly QDRANT_CONFIG_DIR="/etc/qdrant"
readonly LOG_FILE="./HW.txt"
readonly ROLLBACK_FILE="/tmp/xia_rollback_$$.txt"

# ── SMART INSTALL PATH DETECTION ──────────────────────────────────────
# If this script is run from within a valid XIA repo (i.e. the workspace
# IS the monorepo), use that directory in-place. Otherwise clone to /opt/xia.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/package.json" ]] && [[ -d "$SCRIPT_DIR/.git" ]]; then
  XIA_DIR="$SCRIPT_DIR"
  XIA_RUNNING_FROM_REPO=true
else
  XIA_DIR="/opt/xia"
  XIA_RUNNING_FROM_REPO=false
fi
readonly XIA_DIR XIA_RUNNING_FROM_REPO

# Hardware thresholds
readonly RAM_HARD_MIN_MB=4096
readonly RAM_WARN_MIN_MB=8192
readonly DISK_HARD_MIN_GB=10
readonly DISK_WARN_MIN_GB=20
readonly CPU_WARN_MIN=2
readonly UBUNTU_MIN_VERSION="20.04"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m'

# State
HW_VERDICT="PASS"
HEALTH_FAILURES=0
DETECT_GIT="MISSING"; DETECT_BUN="MISSING"; DETECT_REDIS="MISSING"
DETECT_QDRANT="MISSING"; DETECT_XIA_USER="MISSING"; DETECT_XIA_DIRS="MISSING"
DETECT_XIA_REPO="MISSING"; DETECT_XIAD_SERVICE="MISSING"

# ── LOGGING ───────────────────────────────────────────────────────────
init_log() { echo "XIA Manager Log — $(date '+%Y-%m-%d %H:%M:%S %Z')" > "$LOG_FILE"; }

_logf() { printf "[%s] [ %-8s ] %s\n" "$(date '+%H:%M:%S')" "$1" "$2" >> "$LOG_FILE"; }

log_info()     { printf "${CYAN}[  INFO   ]${NC} %s\n" "$*"; _logf "INFO"     "$*"; }
log_pass()     { printf "${GREEN}[  PASS   ]${NC} %s\n" "$*"; _logf "PASS"     "$*"; }
log_warn()     { printf "${YELLOW}[  WARN   ]${NC} %s\n" "$*"; _logf "WARN"     "$*"; }
log_error()    { printf "${RED}[ ERROR   ]${NC} %s\n" "$*" >&2; _logf "ERROR"   "$*"; }
log_step()     { printf "${BLUE}[  ....   ]${NC} %s\n" "$*"; _logf "STEP"     "$*"; }
log_config()   { printf "${CYAN}[ CONFIG  ]${NC} %s\n" "$*"; _logf "CONFIG"   "$*"; }
log_test()     { printf "${BLUE}[ TEST    ]${NC} %s\n" "$*"; _logf "TEST"     "$*"; }
log_rollback() { printf "${YELLOW}[ ROLL ↩  ]${NC} %s\n" "$*"; _logf "ROLLBACK" "$*"; }
log_done()     { printf "${GREEN}${BOLD}[  DONE   ]${NC} %s\n" "$*"; _logf "DONE"     "$*"; }

print_banner() {
  printf "\n${BOLD}${CYAN}"
  printf "╔══════════════════════════════════════════╗\n"
  printf "║    XIA Infrastructure Manager  v%-8s║\n" "${XIA_VERSION}"
  printf "╚══════════════════════════════════════════╝\n"
  printf "${NC}\n"
}

print_section() {
  printf "\n${BOLD}── %s ${NC}\n" "$1"
  printf "   ────────────────────────────────────────\n"
  _logf "SECTION" "$1"
}

# ── ROLLBACK ENGINE ───────────────────────────────────────────────────
rollback_register() { echo "$1" >> "$ROLLBACK_FILE"; }

rollback_execute() {
  trap - ERR EXIT
  [[ ! -f "$ROLLBACK_FILE" ]] && { log_error "No rollback manifest found."; exit 1; }
  printf "\n${YELLOW}${BOLD}Rolling back all changes...${NC}\n\n"
  while IFS= read -r cmd; do
    [[ -z "$cmd" ]] && continue
    log_rollback "$cmd"
    bash -c "$cmd" 2>/dev/null || true
  done < <(tac "$ROLLBACK_FILE")
  rm -f "$ROLLBACK_FILE"
  printf "\n${RED}${BOLD}Installation failed. All changes rolled back.${NC}\n"
  printf "See log: %s\n\n" "$LOG_FILE"
  exit 1
}

rollback_cleanup() { rm -f "$ROLLBACK_FILE"; }
trap 'rollback_execute' ERR

# ── HARDWARE ANALYSIS ─────────────────────────────────────────────────
hw_check_root() {
  [[ "$EUID" -ne 0 ]] && {
    printf "${RED}${BOLD}ERROR:${NC} Run as root: ${BOLD}sudo ./XIA_MANAGER.sh${NC}\n\n"
    exit 1
  }
}

hw_check_os() {
  print_section "Operating System"
  local id ver name
  id=$(grep -oP '(?<=^ID=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "unknown")
  ver=$(grep -oP '(?<=^VERSION_ID=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "0")
  name=$(grep -oP '(?<=^PRETTY_NAME=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "Unknown")
  log_info "OS: $name"
  [[ "$id" != "ubuntu" ]] && { log_error "XIA requires Ubuntu. Found: $id"; HW_VERDICT="BLOCKED"; return; }
  awk "BEGIN{exit !($ver < $UBUNTU_MIN_VERSION)}" && {
    log_error "Ubuntu $ver too old. Minimum: $UBUNTU_MIN_VERSION"; HW_VERDICT="BLOCKED"; return
  }
  log_pass "Ubuntu $ver — meets minimum ($UBUNTU_MIN_VERSION)"
}

hw_check_arch() {
  print_section "Architecture"
  local arch; arch=$(uname -m)
  log_info "Architecture: $arch"
  [[ "$arch" != "x86_64" ]] && {
    log_error "$arch not supported. XIA requires x86_64 (Qdrant binary)."; HW_VERDICT="BLOCKED"; return
  }
  log_pass "x86_64 — confirmed"
}

hw_check_ram() {
  print_section "Memory (RAM)"
  local mb gb
  mb=$(free -m | awk '/^Mem:/ {print $2}')
  gb=$(awk "BEGIN{printf \"%.1f\", $mb/1024}")
  log_info "Total RAM: ${gb}GB"
  if [[ "$mb" -lt "$RAM_HARD_MIN_MB" ]]; then
    log_error "${gb}GB is below hard minimum (4GB). Qdrant+Redis+xiad cannot run."; HW_VERDICT="BLOCKED"; return
  fi
  if [[ "$mb" -lt "$RAM_WARN_MIN_MB" ]]; then
    log_warn "${gb}GB is below recommended (8GB). Will run, but tight."; return
  fi
  log_pass "${gb}GB — meets recommended (8GB)"
}

hw_check_disk() {
  print_section "Disk Space"
  mkdir -p /opt 2>/dev/null || true
  local free total
  free=$(df -BG /opt | awk 'NR==2 {print $4}' | tr -d 'G')
  total=$(df -BG /opt | awk 'NR==2 {print $2}' | tr -d 'G')
  log_info "Partition (/opt): ${total}GB total / ${free}GB free"
  [[ "$free" -lt "$DISK_HARD_MIN_GB" ]] && {
    log_error "${free}GB free is below hard minimum (10GB)."; HW_VERDICT="BLOCKED"; return
  }
  [[ "$free" -lt "$DISK_WARN_MIN_GB" ]] && {
    log_warn "${free}GB free is below recommended (20GB). Qdrant storage grows over time."; return
  }
  log_pass "${free}GB free — meets recommended (20GB)"
}

hw_check_cpu() {
  print_section "CPU"
  local cores model
  cores=$(nproc)
  model=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ //' || echo "Unknown")
  log_info "Model: $model | Cores: $cores"
  [[ "$cores" -lt "$CPU_WARN_MIN" ]] && {
    log_warn "$cores core(s) — below recommended (2). Parallel agents will queue."; return
  }
  log_pass "$cores cores — sufficient"
}

hw_check_internet() {
  print_section "Network"
  log_info "Checking github.com..."
  curl -fsS --max-time 10 --head https://github.com > /dev/null 2>&1 || {
    log_error "Cannot reach github.com. Internet required."; HW_VERDICT="BLOCKED"; return
  }
  log_pass "github.com — reachable"
}

hw_check_systemd() {
  print_section "Init System"
  local pid1; pid1=$(cat /proc/1/comm 2>/dev/null || echo "unknown")
  log_info "PID 1: $pid1"
  [[ "$pid1" != "systemd" ]] && {
    log_error "systemd required. Found: $pid1"; HW_VERDICT="BLOCKED"; return
  }
  log_pass "systemd — running as PID 1"
}

hw_check_tailscale() {
  print_section "Tailscale"
  if command -v tailscale &>/dev/null; then
    log_pass "Tailscale installed — $(tailscale version 2>/dev/null | head -1 || echo 'unknown')"
  else
    log_warn "Tailscale not found. Install separately: https://tailscale.com/download/linux"
  fi
}

generate_hw_report() {
  local verdict_icon="✅"; [[ "$HW_VERDICT" == "BLOCKED" ]] && verdict_icon="❌"
  {
    echo ""
    echo "════════════════════════════════════════════════════"
    echo " XIA Hardware Analysis Report"
    echo " Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "════════════════════════════════════════════════════"
    echo " OS:          $(grep -oP '(?<=^PRETTY_NAME=).+' /etc/os-release 2>/dev/null | tr -d '"')"
    echo " Kernel:      $(uname -r)"
    echo " Arch:        $(uname -m)"
    local mb; mb=$(free -m | awk '/^Mem:/ {print $2}')
    echo " RAM:         $(awk "BEGIN{printf \"%.1f\", $mb/1024}")GB"
    echo " CPU Cores:   $(nproc) — $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ //' || echo 'Unknown')"
    echo " Disk (/opt): $(df -BG /opt | awk 'NR==2 {print $4}' | tr -d 'G')GB free"
    command -v tailscale &>/dev/null && echo " Tailscale:   ✅ Installed" || echo " Tailscale:   ⚠️  NOT INSTALLED"
    echo ""
    echo " VERDICT: ${verdict_icon} $( [[ "$HW_VERDICT" == "BLOCKED" ]] && echo "DOES NOT MEET REQUIREMENTS" || echo "SYSTEM READY")"
    echo "════════════════════════════════════════════════════"
    echo ""
  } | tee -a "$LOG_FILE"
}

run_hardware_analysis() {
  init_log
  log_info "Starting hardware analysis... Log: $LOG_FILE"
  hw_check_os   || true
  hw_check_arch || true
  hw_check_ram  || true
  hw_check_disk || true
  hw_check_cpu  || true
  hw_check_internet || true
  hw_check_systemd  || true
  hw_check_tailscale
  generate_hw_report
  [[ "$HW_VERDICT" == "BLOCKED" ]] && {
    log_error "System does not meet minimum requirements. Aborted."
    exit 1
  }
}

# ── COMPONENT DETECTION ───────────────────────────────────────────────
detect_all() {
  print_section "Component Detection"

  if command -v git &>/dev/null; then
    DETECT_GIT="OK"; log_pass  "git            — $(git --version | awk '{print $3}')"
  else
    log_info "git            — MISSING"
  fi

  if [[ -f "/usr/local/bin/bun" ]] || command -v bun &>/dev/null; then
    DETECT_BUN="OK"; log_pass  "bun            — $(bun --version 2>/dev/null || echo 'installed')"
  else
    log_info "bun            — MISSING"
  fi

  if dpkg -s redis-server &>/dev/null 2>&1; then
    if systemctl is-active --quiet redis-server 2>/dev/null; then
      DETECT_REDIS="OK"; log_pass "redis-server   — installed + running"
    else
      DETECT_REDIS="BROKEN"; log_warn "redis-server   — installed but NOT running (will repair)"
    fi
  else
    log_info "redis-server   — MISSING"
  fi

  if [[ -f "$QDRANT_BIN" ]]; then
    if systemctl is-active --quiet qdrant 2>/dev/null; then
      DETECT_QDRANT="OK"; log_pass "qdrant         — installed + running"
    else
      DETECT_QDRANT="BROKEN"; log_warn "qdrant         — installed but NOT running (will repair)"
    fi
  else
    log_info "qdrant         — MISSING"
  fi

  if id "$XIA_USER" &>/dev/null 2>&1; then
    DETECT_XIA_USER="OK"; log_pass "xia user       — exists"
  else
    log_info "xia user       — MISSING"
  fi

  if [[ -d "$XIA_SECRETS_DIR" ]] && [[ -d "$XIA_CONFIG_DIR" ]]; then
    DETECT_XIA_DIRS="OK"; log_pass "/etc/xia/      — directories exist"
  elif [[ -d "/etc/xia" ]]; then
    DETECT_XIA_DIRS="OUTDATED"; log_warn "/etc/xia/      — partial (will complete)"
  else
    log_info "/etc/xia/      — MISSING"
  fi

  if [[ "$XIA_RUNNING_FROM_REPO" == true ]]; then
    local branch; branch=$(git -C "$XIA_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    DETECT_XIA_REPO="OK"; log_pass "repo           — running in-place from $XIA_DIR (branch: $branch)"
  elif [[ -d "$XIA_DIR/.git" ]]; then
    local branch; branch=$(git -C "$XIA_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    DETECT_XIA_REPO="OK"; log_pass "$XIA_DIR       — cloned (branch: $branch)"
  elif [[ -d "$XIA_DIR" ]]; then
    DETECT_XIA_REPO="BROKEN"; log_warn "$XIA_DIR       — exists but not a git repo (will fix)"
  else
    log_info "$XIA_DIR       — MISSING (will clone)"
  fi

  if systemctl list-unit-files xiad.service &>/dev/null 2>&1; then
    DETECT_XIAD_SERVICE="OK"; log_pass "xiad.service   — registered"
  else
    log_info "xiad.service   — MISSING"
  fi
}

# ── INSTALLATION FUNCTIONS ────────────────────────────────────────────

install_system_packages() {
  print_section "System Packages"
  log_step "Running apt-get update..."
  apt-get update -qq || { log_error "apt-get update failed"; rollback_execute; }
  local pkgs=("git" "curl" "wget" "build-essential" "tar" "jq")
  for pkg in "${pkgs[@]}"; do
    if ! dpkg -s "$pkg" &>/dev/null 2>&1; then
      log_step "Installing $pkg..."
      rollback_register "apt-get remove -y $pkg 2>/dev/null || true"
      apt-get install -y -qq "$pkg" || { log_error "Failed to install $pkg"; rollback_execute; }
      log_pass "$pkg — installed"
    else
      log_pass "$pkg — already present"
    fi
  done
}

install_bun() {
  [[ "$DETECT_BUN" == "OK" ]] && { log_pass "bun — already installed, skipping"; return; }
  print_section "Bun Runtime"
  log_step "Installing Bun to /usr/local..."
  rollback_register "rm -f /usr/local/bin/bun /usr/local/bin/bunx"
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s -- --no-install-completions \
    || { log_error "Bun installation failed"; rollback_execute; }
  export PATH="/usr/local/bin:$PATH"
  log_pass "bun $(bun --version) — installed"
}

install_gemini_cli() {
  print_section "Gemini CLI"
  if command -v gemini &>/dev/null; then
    log_pass "Gemini CLI — already installed, skipping"
    return
  fi
  log_step "Installing @google/gemini-cli globally via Bun..."
  rollback_register "bun rm -g @google/gemini-cli 2>/dev/null || true"
  # Install and trust the postinstall script so binaries link correctly
  bun install -g @google/gemini-cli || { log_error "Gemini CLI installation failed"; rollback_execute; }
  bun pm trust -g @google/gemini-cli 2>/dev/null || true
  
  # Ensure it is in PATH or symlink it
  if [[ -f "/root/.bun/bin/gemini" ]]; then
    ln -sf /root/.bun/bin/gemini /usr/local/bin/gemini
  fi
  
  log_pass "Gemini CLI installed"
}

install_redis() {
  if [[ "$DETECT_REDIS" == "OK" ]]; then log_pass "redis-server — already running, skipping"; return; fi
  print_section "Redis"
  if [[ "$DETECT_REDIS" != "BROKEN" ]]; then
    log_step "Installing redis-server..."
    rollback_register "apt-get remove -y redis-server 2>/dev/null || true"
    apt-get install -y -qq redis-server || { log_error "redis-server install failed"; rollback_execute; }
  fi
  configure_redis
  log_step "Starting redis-server..."
  systemctl enable redis-server --quiet
  systemctl restart redis-server || { log_error "redis-server failed to start"; rollback_execute; }
  log_pass "redis-server — installed and running"
}

install_qdrant() {
  if [[ "$DETECT_QDRANT" == "OK" ]]; then log_pass "qdrant — already running, skipping"; return; fi
  print_section "Qdrant"
  if [[ "$DETECT_QDRANT" != "BROKEN" ]]; then
    log_step "Fetching latest Qdrant version from GitHub..."
    local ver
    ver=$(curl -fsS --max-time 15 \
      "https://api.github.com/repos/qdrant/qdrant/releases/latest" \
      | grep '"tag_name"' | cut -d'"' -f4) \
      || { log_error "Could not fetch Qdrant release info."; rollback_execute; }
    log_info "Qdrant version: $ver"
    local url="https://github.com/qdrant/qdrant/releases/download/${ver}/qdrant-x86_64-unknown-linux-gnu.tar.gz"
    log_step "Downloading Qdrant binary..."
    local tmpdir; tmpdir=$(mktemp -d)
    curl -fsSL --max-time 120 "$url" -o "$tmpdir/qdrant.tar.gz" \
      || { log_error "Qdrant download failed"; rm -rf "$tmpdir"; rollback_execute; }
    tar -xzf "$tmpdir/qdrant.tar.gz" -C "$tmpdir"
    rollback_register "rm -f $QDRANT_BIN"
    mv "$tmpdir/qdrant" "$QDRANT_BIN"
    chmod +x "$QDRANT_BIN"
    rm -rf "$tmpdir"
    log_pass "Qdrant binary installed at $QDRANT_BIN"
  fi
  configure_qdrant
  log_step "Starting qdrant..."
  systemctl enable qdrant --quiet
  systemctl restart qdrant || { log_error "Qdrant service failed to start"; rollback_execute; }
  log_pass "qdrant — installed and running"
}

create_xia_user() {
  [[ "$DETECT_XIA_USER" == "OK" ]] && { log_pass "xia user — already exists, skipping"; return; }
  print_section "XIA System User"
  rollback_register "userdel $XIA_USER 2>/dev/null || true"
  useradd --system --no-create-home --shell /bin/false "$XIA_USER" \
    || { log_error "Failed to create xia system user"; rollback_execute; }
  log_pass "System user '$XIA_USER' created"
}

create_xia_dirs() {
  print_section "XIA Directories"
  rollback_register "rm -rf /etc/xia"
  mkdir -p "$XIA_SECRETS_DIR" "$XIA_CONFIG_DIR"
  chown -R "$XIA_USER:$XIA_USER" /etc/xia
  chmod 700 /etc/xia "$XIA_SECRETS_DIR" "$XIA_CONFIG_DIR"
  configure_xia_secrets
  configure_xia_budgets
  log_pass "/etc/xia/ structure created"
}

clone_xia_repo() {
  print_section "XIA Repository"

  if [[ "$XIA_RUNNING_FROM_REPO" == true ]]; then
    # Script is running from inside the repo — no clone needed
    log_pass "Running in-place from $XIA_DIR — skipping clone"
    log_step "Pulling latest changes..."
    git -C "$XIA_DIR" pull --ff-only 2>/dev/null || log_warn "Could not pull — check manually."
  elif [[ "$DETECT_XIA_REPO" == "BROKEN" ]]; then
    log_warn "$XIA_DIR exists but is not a git repo — removing and re-cloning..."
    rm -rf "$XIA_DIR"
    rollback_register "rm -rf $XIA_DIR"
    git clone --depth 1 "$XIA_REPO" "$XIA_DIR" \
      || { log_error "git clone failed."; rollback_execute; }
    chown -R "$XIA_USER:$XIA_USER" "$XIA_DIR"
    log_pass "Repository cloned to $XIA_DIR"
  elif [[ "$DETECT_XIA_REPO" != "OK" ]]; then
    log_step "Cloning $XIA_REPO → $XIA_DIR ..."
    rollback_register "rm -rf $XIA_DIR"
    git clone --depth 1 "$XIA_REPO" "$XIA_DIR" \
      || { log_error "git clone failed. Check repo URL and internet."; rollback_execute; }
    chown -R "$XIA_USER:$XIA_USER" "$XIA_DIR"
    log_pass "Repository cloned to $XIA_DIR"
  else
    log_step "Pulling latest changes..."
    git -C "$XIA_DIR" pull --ff-only || log_warn "Could not pull latest — check manually."
    log_pass "Repository up to date"
  fi

  log_step "Installing Bun workspace dependencies..."
  (cd "$XIA_DIR" && bun install --frozen-lockfile 2>/dev/null || bun install) \
    || { log_error "bun install failed in $XIA_DIR"; rollback_execute; }
  log_pass "Workspace dependencies installed"
}

# ── CONFIGURATION FUNCTIONS ───────────────────────────────────────────

configure_redis() {
  log_config "Configuring Redis (appendonly + localhost bind)..."
  local conf="/etc/redis/redis.conf"
  [[ ! -f "$conf" ]] && { log_warn "redis.conf not found — skipping"; return; }
  sed -i 's/^appendonly no/appendonly yes/' "$conf"
  grep -q "^bind 127.0.0.1" "$conf" || sed -i 's/^bind .*/bind 127.0.0.1/' "$conf"
  log_pass "Redis configured: appendonly=yes, bind=127.0.0.1"
}

configure_qdrant() {
  log_config "Configuring Qdrant..."
  useradd --system --no-create-home --shell /bin/false qdrant 2>/dev/null || true
  mkdir -p "$QDRANT_DATA_DIR/storage" "$QDRANT_DATA_DIR/snapshots" "$QDRANT_CONFIG_DIR"
  rollback_register "rm -rf $QDRANT_DATA_DIR $QDRANT_CONFIG_DIR"
  chown -R qdrant:qdrant "$QDRANT_DATA_DIR" "$QDRANT_CONFIG_DIR"
  cat > "$QDRANT_CONFIG_DIR/config.yaml" <<'QDCFG'
storage:
  storage_path: "/var/lib/qdrant/storage"
  snapshots_path: "/var/lib/qdrant/snapshots"
service:
  host: "127.0.0.1"
  http_port: 6333
  grpc_port: 6334
QDCFG
  cat > /etc/systemd/system/qdrant.service <<QDSVC
[Unit]
Description=Qdrant Vector Database
After=network.target

[Service]
Type=simple
User=qdrant
Group=qdrant
ExecStart=$QDRANT_BIN --config-path $QDRANT_CONFIG_DIR/config.yaml
WorkingDirectory=$QDRANT_DATA_DIR
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
QDSVC
  rollback_register "rm -f /etc/systemd/system/qdrant.service"
  systemctl daemon-reload
  log_pass "Qdrant configured: localhost:6333"
}

configure_xia_secrets() {
  local f="$XIA_SECRETS_DIR/global.env"
  [[ -f "$f" ]] && { log_pass "global.env already exists — not overwriting"; return; }
  log_config "Creating secrets template..."
  cat > "$f" <<'ENVCFG'
# XIA Global Secrets — fill in before starting xiad
ANTIGRAVITY_KEY=
KILO_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=
NTFY_URL=
ENVCFG
  chown "$XIA_USER:$XIA_USER" "$f"
  chmod 600 "$f"
  log_pass "global.env created (fill in API keys before starting xiad)"
}

configure_xia_budgets() {
  local f="$XIA_CONFIG_DIR/budgets.json"
  [[ -f "$f" ]] && { log_pass "budgets.json already exists — not overwriting"; return; }
  log_config "Writing default budget configuration..."
  cat > "$f" <<'BUDGETCFG'
{
  "windows": { "daily": true, "weekly": false, "monthly": true },
  "providers": {
    "antigravity": { "daily": 5.00, "monthly": 80.00 },
    "kilo":        { "daily": 3.00, "monthly": 50.00 }
  },
  "projects": {
    "hermes":  { "daily": 4.00, "priority": "critical" },
    "auruvi":  { "daily": 2.00 },
    "iocl":    { "daily": 2.00 },
    "sail":    { "daily": 2.00 },
    "iot":     { "daily": 1.00 },
    "general": { "daily": 1.00 }
  },
  "thresholds": { "warn_pct": 70, "pause_pct": 90, "hard_stop_pct": 100 }
}
BUDGETCFG
  chown "$XIA_USER:$XIA_USER" "$f"
  log_pass "budgets.json created with defaults"
}

configure_xiad_service() {
  print_section "xiad Service"
  [[ "$DETECT_XIAD_SERVICE" == "OK" ]] && { log_pass "xiad.service already registered"; return; }
  log_config "Registering xiad.service..."
  cat > /etc/systemd/system/xiad.service <<XIADSVC
[Unit]
Description=XIA Daemon — Personal AI Development Infrastructure
After=network.target redis-server.service qdrant.service
Requires=redis-server.service qdrant.service

[Service]
Type=simple
User=$XIA_USER
Group=$XIA_USER
WorkingDirectory=$XIA_DIR/apps/daemon
EnvironmentFile=$XIA_SECRETS_DIR/global.env
ExecStart=/usr/local/bin/bun run index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
XIADSVC
  rollback_register "rm -f /etc/systemd/system/xiad.service"
  systemctl daemon-reload
  log_pass "xiad.service registered (start manually after filling in secrets)"
}

# ── TEST / VERIFICATION FUNCTIONS ─────────────────────────────────────

test_bun() {
  log_test "bun --version..."
  bun --version &>/dev/null && { log_pass "bun — OK"; return 0; }
  log_error "bun — FAIL"; (( HEALTH_FAILURES++ )); return 1
}

test_redis() {
  log_test "Redis ping..."
  local resp; resp=$(redis-cli ping 2>/dev/null || echo "FAIL")
  [[ "$resp" == "PONG" ]] && { log_pass "Redis — PONG"; return 0; }
  log_error "Redis — $resp"; (( HEALTH_FAILURES++ )); return 1
}

test_qdrant() {
  log_test "Qdrant health check..."
  local resp; resp=$(curl -fsS --max-time 5 http://localhost:6333/readyz 2>/dev/null || echo "{}")
  echo "$resp" | grep -q '"ok"' && { log_pass "Qdrant — OK"; return 0; }
  log_error "Qdrant — unhealthy ($resp)"; (( HEALTH_FAILURES++ )); return 1
}

test_xia_repo() {
  log_test "XIA repository..."
  [[ -d "$XIA_DIR/.git" ]] && { log_pass "XIA repo — present at $XIA_DIR"; return 0; }
  log_error "XIA repo — not found"; (( HEALTH_FAILURES++ )); return 1
}

run_health_check() {
  print_section "Health Check"
  HEALTH_FAILURES=0
  test_bun    || true
  test_redis  || true
  test_qdrant || true
  test_xia_repo || true
  printf "\n"
  if [[ "$HEALTH_FAILURES" -eq 0 ]]; then
    log_done "All health checks passed."; return 0
  else
    log_error "$HEALTH_FAILURES health check(s) failed."; return 1
  fi
}

# ── UNINSTALL ENGINE ──────────────────────────────────────────────────

scan_installation() {
  local score=0
  id "$XIA_USER" &>/dev/null 2>&1                               && (( score++ ))
  [[ -d "/etc/xia" ]]                                           && (( score++ ))
  # Only count XIA_DIR if it is the canonical install path, not the dev workspace
  [[ "$XIA_RUNNING_FROM_REPO" == false ]] && [[ -d "$XIA_DIR" ]] && (( score++ ))
  [[ -f "$QDRANT_BIN" ]]                                        && (( score++ ))
  [[ -d "$QDRANT_DATA_DIR" ]]                                   && (( score++ ))
  systemctl list-unit-files qdrant.service &>/dev/null 2>&1     && (( score++ ))
  systemctl list-unit-files xiad.service &>/dev/null 2>&1       && (( score++ ))
  dpkg -s redis-server &>/dev/null 2>&1                         && (( score++ ))
  # Only count node_modules if not the dev workspace
  [[ "$XIA_RUNNING_FROM_REPO" == false ]] && [[ -d "$XIA_DIR/node_modules" ]] && (( score++ ))

  local failing=0
  systemctl list-unit-files xiad.service &>/dev/null 2>&1 && \
    ! systemctl is-active --quiet xiad 2>/dev/null    && (( failing++ )) || true
  systemctl list-unit-files qdrant.service &>/dev/null 2>&1 && \
    ! systemctl is-active --quiet qdrant 2>/dev/null  && (( failing++ )) || true

  if   [[ "$score" -eq 0 ]];    then echo "NONE"
  elif [[ "$failing" -gt 0 ]];  then echo "PROBLEMATIC"
  elif [[ "$score" -ge 8 ]];    then echo "FULL"
  else                               echo "PARTIAL"
  fi
}

report_uninstall_scope() {
  local state="$1"
  printf "\n${BOLD}══════════════════════════════════════════════════${NC}\n"
  printf " XIA Uninstall — State: ${BOLD}%s${NC}\n" "$state"
  printf "${BOLD}══════════════════════════════════════════════════${NC}\n"
  printf " The following will be PERMANENTLY removed:\n\n"
  id "$XIA_USER" &>/dev/null 2>&1       && printf "  ${RED}✗${NC}  System user:    xia\n"
  [[ -d "/etc/xia" ]]                   && printf "  ${RED}✗${NC}  Directory:      /etc/xia  ${YELLOW}⚠️  (contains secrets)${NC}\n"
  [[ -d "$XIA_DIR" ]]                   && printf "  ${RED}✗${NC}  Directory:      $XIA_DIR\n"
  [[ -f "$QDRANT_BIN" ]]                && printf "  ${RED}✗${NC}  Binary:         $QDRANT_BIN\n"
  [[ -d "$QDRANT_DATA_DIR" ]]           && printf "  ${RED}✗${NC}  Data:           $QDRANT_DATA_DIR\n"
  [[ -d "$QDRANT_CONFIG_DIR" ]]         && printf "  ${RED}✗${NC}  Config:         $QDRANT_CONFIG_DIR\n"
  [[ -f "/etc/systemd/system/qdrant.service" ]] && printf "  ${RED}✗${NC}  Service:        qdrant.service\n"
  [[ -f "/etc/systemd/system/xiad.service" ]]   && printf "  ${RED}✗${NC}  Service:        xiad.service\n"
  printf "\n  ${CYAN}○${NC}  redis-server, git, curl — KEPT (shared packages)\n"
  printf "  ${CYAN}○${NC}  Tailscale — KEPT (not managed by XIA)\n"
  printf "\n${YELLOW}${BOLD}  ⚠️  IRREVERSIBLE. Secrets will be permanently deleted.${NC}\n"
  printf "${BOLD}══════════════════════════════════════════════════${NC}\n\n"
}

uninstall_xia() {
  print_section "Removing XIA"
  log_step "Stopping services..."
  systemctl stop xiad qdrant 2>/dev/null || true
  systemctl disable xiad qdrant 2>/dev/null || true
  log_step "Removing service units..."
  rm -f /etc/systemd/system/xiad.service /etc/systemd/system/qdrant.service
  systemctl daemon-reload
  log_step "Removing Qdrant..."
  rm -f "$QDRANT_BIN"
  rm -rf "$QDRANT_DATA_DIR" "$QDRANT_CONFIG_DIR"
  log_step "Removing /etc/xia..."
  rm -rf /etc/xia
  if [[ "$XIA_RUNNING_FROM_REPO" == false ]]; then
    # Only remove XIA_DIR if it was cloned by the installer, not the dev workspace
    log_step "Removing XIA repository at $XIA_DIR ..."
    rm -rf "$XIA_DIR"
  else
    log_warn "Skipping removal of $XIA_DIR — running from within the repo (remove manually if needed)."
  fi
  log_step "Removing system users..."
  userdel "$XIA_USER" 2>/dev/null || true
  userdel qdrant      2>/dev/null || true
  systemctl daemon-reload
  log_done "XIA removed."
}

verify_clean() {
  local state; state=$(scan_installation)
  [[ "$state" == "NONE" ]] \
    && log_pass "Verification: System is clean." \
    || log_warn "Verification: Some artefacts may remain (state: $state). Check manually."
}

# ── MAIN FLOWS ────────────────────────────────────────────────────────

do_install() {
  print_banner
  run_hardware_analysis
  detect_all

  print_section "Installation Plan"
  printf "\n"
  [[ "$DETECT_GIT"          != "OK" ]] && printf "  ⬜  System packages (git, curl, wget, build-essential, jq)\n"
  [[ "$DETECT_BUN"          != "OK" ]] && printf "  ⬜  Bun runtime\n"
  [[ "$DETECT_REDIS"        != "OK" ]] && printf "  ⬜  Redis\n"
  [[ "$DETECT_QDRANT"       != "OK" ]] && printf "  ⬜  Qdrant\n"
  [[ "$DETECT_XIA_USER"     != "OK" ]] && printf "  ⬜  xia system user\n"
  [[ "$DETECT_XIA_DIRS"     != "OK" ]] && printf "  ⬜  /etc/xia/ directories\n"
  [[ "$DETECT_XIA_REPO"     != "OK" ]] && printf "  ⬜  XIA repository → /opt/xia\n"
  [[ "$DETECT_XIAD_SERVICE" != "OK" ]] && printf "  ⬜  xiad.service\n"
  printf "\n"

  if [[ "${1:-}" != "--yes" ]]; then
    read -r -p "  Proceed? [y/N]: " confirm
    [[ ! "$confirm" =~ ^[yY]$ ]] && { printf "Aborted.\n"; exit 0; }
  fi
  install_system_packages
  install_bun
  install_gemini_cli
  install_redis
  install_qdrant
  create_xia_user
  create_xia_dirs
  clone_xia_repo
  configure_xiad_service
  run_health_check
  rollback_cleanup

  print_section "Next Steps"
  printf "\n  1. Fill in API keys:  ${BOLD}sudo nano /etc/xia/secrets/global.env${NC}\n"
  printf "  2. Create Telegram bot: see ${BOLD}$XIA_DIR/docs/SETUP_GUIDE_TELEGRAM.md${NC}\n"
  printf "  3. Review budgets:    ${BOLD}cat /etc/xia/config/budgets.json${NC}\n"
  printf "  4. Start daemon:      ${BOLD}sudo systemctl start xiad${NC}\n\n"
  log_done "Installation complete. HW report: $LOG_FILE"
}

do_uninstall() {
  hw_check_root
  print_banner
  local state; state=$(scan_installation)
  if [[ "$state" == "NONE" ]]; then
    printf "\n${GREEN}No XIA installation found on this system.${NC}\n\n"; exit 0
  fi
  report_uninstall_scope "$state"
  if [[ "${1:-}" != "--yes" ]]; then
    read -r -p "  Type 'CONFIRM' to proceed: " confirm
    [[ "$confirm" != "CONFIRM" ]] && { printf "Aborted.\n"; exit 0; }
  fi
  uninstall_xia
  verify_clean
}

do_check() {
  hw_check_root
  run_health_check
  [[ "$HEALTH_FAILURES" -gt 0 ]] && exit 1; exit 0
}

show_menu() {
  print_banner
  printf "  ${BOLD}[1]${NC} Install / Repair XIA\n"
  printf "  ${BOLD}[2]${NC} Uninstall XIA\n"
  printf "  ${BOLD}[3]${NC} System Health Check\n"
  printf "  ${BOLD}[Q]${NC} Quit\n\n"
  read -r -p "  Select option: " choice
  case "$choice" in
    1) do_install ;;
    2) do_uninstall ;;
    3) do_check ;;
    [qQ]) exit 0 ;;
    *) log_error "Invalid option."; show_menu ;;
  esac
}

# ── ENTRYPOINT ────────────────────────────────────────────────────────
# Root check runs once here — not repeated inside sub-functions
hw_check_root

case "${1:-}" in
  --install)   do_install  "--yes" ;;
  --uninstall) do_uninstall "--yes" ;;
  --check)     do_check ;;
  "")          show_menu ;;
  *)
    printf "Usage: sudo ./XIA_MANAGER.sh [--install | --uninstall | --check]\n"
    exit 1
    ;;
esac
