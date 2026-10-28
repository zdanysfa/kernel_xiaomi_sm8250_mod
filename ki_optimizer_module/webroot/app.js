/**
 * Ki-Optimizer WebUI Controller
 * Native JavaScript Bridge for KernelSU WebView
 * Clean, Emoticon-free, Ultra-Responsive UI
 */

let callbackCounter = 0;
function getUniqueCallbackName(prefix) {
  return `${prefix}_cb_${Date.now()}_${callbackCounter++}`;
}

// Execute Shell Command via KernelSU Bridge
function exec(command, options = {}) {
  if (typeof ksu === "undefined") {
    console.log("[Dev Mode] Shell Exec:", command);
    return Promise.resolve({ errno: 0, stdout: "", stderr: "" });
  }

  return new Promise((resolve, reject) => {
    const callbackFuncName = getUniqueCallbackName("exec");
    window[callbackFuncName] = (errno, stdout, stderr) => {
      resolve({ errno, stdout, stderr });
      delete window[callbackFuncName];
    };

    try {
      ksu.exec(command, JSON.stringify(options), callbackFuncName);
    } catch (error) {
      delete window[callbackFuncName];
      reject(error);
    }
  });
}

// Minimalist Toast notification helper
let toastTimeout = null;
function showToast(message, isError = false) {
  if (typeof ksu !== "undefined" && ksu.toast) {
    ksu.toast(message);
  }
  
  const toastEl = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  if (toastEl && toastText) {
    toastText.textContent = message;
    toastEl.classList.toggle("toast-error", !!isError);
    toastEl.classList.add("show");
    
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2200);
  }
}

// UI Elements - Tabs
const tabKernel = document.getElementById("tab-kernel");
const panelKernel = document.getElementById("panel-kernel");

// Header Telemetry
const elUnsupportedModal = document.getElementById("unsupported-modal");
const elModalKernelVer = document.getElementById("modal-kernel-ver");

const elCurProfile = document.getElementById("cur-profile");
const elCurBattery = document.getElementById("cur-battery");
const elCurTemp = document.getElementById("cur-temp");
const elDeviceModel = document.getElementById("device-model");

// Profiles
const cardProf0 = document.getElementById("card-prof-0");
const cardProf1 = document.getElementById("card-prof-1");
const cardProf2 = document.getElementById("card-prof-2");

// Kernel Feature Rows


const rowBypass = document.getElementById("row-bypass");
const toggleBypass = document.getElementById("toggle-bypass");
const badgeBypass = document.getElementById("badge-bypass");

const rowFastCharge = document.getElementById("row-fastcharge");
const toggleFastCharge = document.getElementById("toggle-fastcharge");
const badgeFastCharge = document.getElementById("badge-fastcharge");

const rowScreenOff = document.getElementById("row-screenoff");
const toggleScreenOff = document.getElementById("toggle-screenoff");
const badgeScreenOff = document.getElementById("badge-screenoff");

const rowWakelock = document.getElementById("row-wakelock");
const toggleWakelock = document.getElementById("toggle-wakelock");
const badgeWakelock = document.getElementById("badge-wakelock");

const rowDynFsync = document.getElementById("row-dynfsync");
const toggleDynFsync = document.getElementById("toggle-dynfsync");
const badgeDynFsync = document.getElementById("badge-dynfsync");


const rowTcp = document.getElementById("row-tcp");
const selectTcp = document.getElementById("select-tcp");
const badgeTcp = document.getElementById("badge-tcp");

const btnApply = document.getElementById("btn-apply");

let currentProfile = 1;
let isKiKernelActive = true;
let activeTab = "panel-kernel";

// Interaction tracking to prevent background telemetry stutter
let isUserInteracting = false;
let interactTimer = null;
function flagUserInteraction() {
  isUserInteracting = true;
  if (interactTimer) clearTimeout(interactTimer);
  interactTimer = setTimeout(() => {
    isUserInteracting = false;
  }, 1000);
}

document.addEventListener("touchstart", flagUserInteraction, { passive: true });
document.addEventListener("touchmove", flagUserInteraction, { passive: true });
document.addEventListener("pointerdown", flagUserInteraction, { passive: true });

// Tab Switcher
function switchTab(target) {
  activeTab = target;
  tabKernel?.classList.add("active");
  tabKernel?.setAttribute("aria-selected", "true");
  panelKernel?.classList.remove("hidden");
}

// Helper to configure feature row support
function updateFeatureRow(row, input, badge, isSupported, isEnabled, labelOn, labelOff) {
  if (!row) return;
  if (!isSupported) {
    row.classList.add("is-unsupported");
    if (input) input.disabled = true;
    if (badge) {
      badge.textContent = "Unsupported";
      badge.classList.add("is-unsupported");
      badge.classList.remove("is-off");
    }
  } else {
    row.classList.remove("is-unsupported");
    if (input) {
      input.disabled = false;
      input.checked = isEnabled;
    }
    if (badge) {
      badge.classList.remove("is-unsupported");
      badge.textContent = isEnabled ? labelOn : labelOff;
      badge.classList.toggle("is-off", !isEnabled);
    }
  }
}

// Update Active Profile UI
function setActiveProfileUI(profileId) {
  currentProfile = parseInt(profileId, 10);
  [cardProf0, cardProf1, cardProf2].forEach(card => {
    if (card) {
      card.classList.remove("active");
      card.setAttribute("aria-pressed", "false");
    }
  });
  
  if (currentProfile === 0) {
    cardProf0?.classList.add("active");
    cardProf0?.setAttribute("aria-pressed", "true");
    if (elCurProfile) {
      elCurProfile.textContent = "BATTERY";
      elCurProfile.style.color = "var(--accent)";
    }
  } else if (currentProfile === 2) {
    cardProf2?.classList.add("active");
    cardProf2?.setAttribute("aria-pressed", "true");
    if (elCurProfile) {
      elCurProfile.textContent = "TURBO";
      elCurProfile.style.color = "var(--accent)";
    }
  } else {
    cardProf1?.classList.add("active");
    cardProf1?.setAttribute("aria-pressed", "true");
    if (elCurProfile) {
      elCurProfile.textContent = "BALANCED";
      elCurProfile.style.color = "var(--accent)";
    }
  }
}

// Instant Optimistic Profile Switcher
async function setProfileInstant(profileId) {
  if (!isKiKernelActive) return;
  const id = parseInt(profileId, 10);
  
  // Instant visual update (0ms latency feedback)
  setActiveProfileUI(id);
  const names = ["Battery Saver", "Balanced", "Turbo Gaming"];
  showToast(`Switched to ${names[id]} profile`);

  try {
    await exec(`
      echo ${id} > /sys/kernel/ki_profile/mode 2>/dev/null
      CONF="/sdcard/ki_optimizer.conf"
      if [ -f "$CONF" ]; then
        sed -i -E "s/^KI_PROFILE=.*/KI_PROFILE=${id}/" "$CONF" 2>/dev/null
      fi
    `);
  } catch (err) {
    console.error("setProfileInstant error:", err);
    showToast("Failed to switch profile", true);
  }
}

async function updateTelemetry() {
  if (!isKiKernelActive || isUserInteracting) return;
  try {
    const { stdout } = await exec(`
      cat /sys/class/power_supply/battery/capacity 2>/dev/null || echo ""
      cat /sys/class/power_supply/battery/temp 2>/dev/null || echo ""
      cat /sys/kernel/ki_profile/mode 2>/dev/null || cut -d' ' -f1 /proc/ki_profile 2>/dev/null || echo ""
    `);
    const lines = stdout.trim().split("\n");
    if (lines[0] && elCurBattery) {
      elCurBattery.textContent = `${lines[0].trim()}%`;
    }
    if (lines[1] && elCurTemp) {
      const rawTemp = parseInt(lines[1].trim(), 10);
      if (!isNaN(rawTemp)) {
        elCurTemp.textContent = `${(rawTemp / 10).toFixed(1)}°C`;
      }
    }
    if (lines[2]) {
      const liveProf = parseInt(lines[2].trim(), 10);
      if (!isNaN(liveProf) && liveProf !== currentProfile) {
        setActiveProfileUI(liveProf);
      }
    }
  } catch (err) {
    console.warn("updateTelemetry failed:", err);
  }
}

// Fetch Full Initial State from Device
async function refreshState() {
  try {
    const { stdout } = await exec(`
      KERNEL="$(uname -r)"
      IS_KI=0
      if echo "$KERNEL" | grep -qi "ki-kernel" || [ -f /proc/ki_profile ] || [ -d /sys/kernel/ki_profile ]; then
        IS_KI=1
      fi

      MODEL="$(getprop ro.product.model 2>/dev/null || echo 'POCO F4')"
      BATT="$(cat /sys/class/power_supply/battery/capacity 2>/dev/null || echo '--')"
      TEMP="$(cat /sys/class/power_supply/battery/temp 2>/dev/null || echo '--')"
      
      PROF="$(cat /sys/kernel/ki_profile/mode 2>/dev/null || cut -d' ' -f1 /proc/ki_profile 2>/dev/null || echo '1')"

      # Check feature availability
      HAS_BYPASS=0
      VAL_BYPASS=0
      if [ -f /proc/bypass_charging ] || [ -f /sys/class/power_supply/battery/bypass_charging ]; then
        HAS_BYPASS=1
        VAL_BYPASS="$(cat /proc/bypass_charging 2>/dev/null || cat /sys/class/power_supply/battery/bypass_charging 2>/dev/null || echo '0')"
      fi

      HAS_FC=0
      VAL_FC=0
      if [ -f /sys/kernel/fast_charge/force_fast_charge ] || [ -f /sys/kernel/fast_charge/screen_on_fast_charge ]; then
        HAS_FC=1
        VAL_FC="$(cat /sys/kernel/fast_charge/force_fast_charge 2>/dev/null || echo '0')"
      fi

      HAS_SCREENOFF=0
      VAL_SCREENOFF=0
      if [ -f /sys/kernel/ki_profile/screen_off_battery ]; then
        HAS_SCREENOFF=1
        VAL_SCREENOFF="$(cat /sys/kernel/ki_profile/screen_off_battery 2>/dev/null || echo '0')"
      fi

      HAS_WAKELOCK=0
      VAL_WAKELOCK=0
      if [ -f /sys/kernel/wakelock_blocker/enabled ] || [ -f /sys/devices/virtual/misc/boeffla_wakelock_blocker/wakelock_blocker ]; then
        HAS_WAKELOCK=1
        VAL_WAKELOCK="$(cat /sys/kernel/wakelock_blocker/enabled 2>/dev/null || cat /sys/devices/virtual/misc/boeffla_wakelock_blocker/wakelock_blocker 2>/dev/null || echo '0')"
      fi

      HAS_DYNSYNC=0
      VAL_DYNSYNC=0
      if [ -f /sys/kernel/dyn_fsync/Dyn_fsync_active ] || [ -f /sys/kernel/dyn_fsync/dyn_fsync_active ]; then
        HAS_DYNSYNC=1
        VAL_DYNSYNC="$(cat /sys/kernel/dyn_fsync/Dyn_fsync_active 2>/dev/null || cat /sys/kernel/dyn_fsync/dyn_fsync_active 2>/dev/null || echo '0')"
      fi

      VAL_TCP="$(cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null || echo 'cubic')"

      echo "IS_KI=$IS_KI"
      echo "KERNEL=$KERNEL"
      echo "MODEL=$MODEL"
      echo "BATT=$BATT"
      echo "TEMP=$TEMP"
      echo "PROF=$PROF"
      echo "HAS_BYPASS=$HAS_BYPASS"
      echo "VAL_BYPASS=$VAL_BYPASS"
      echo "HAS_FC=$HAS_FC"
      echo "VAL_FC=$VAL_FC"
      echo "HAS_SCREENOFF=$HAS_SCREENOFF"
      echo "VAL_SCREENOFF=$VAL_SCREENOFF"
      echo "HAS_WAKELOCK=$HAS_WAKELOCK"
      echo "VAL_WAKELOCK=$VAL_WAKELOCK"
      echo "HAS_DYNSYNC=$HAS_DYNSYNC"
      echo "VAL_DYNSYNC=$VAL_DYNSYNC"
      echo "VAL_TCP=$VAL_TCP"
    `);

    const props = {};
    stdout.trim().split("\n").forEach(line => {
      const idx = line.indexOf("=");
      if (idx > -1) {
        props[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    });

    if (props["IS_KI"] === "0") {
      isKiKernelActive = false;
      if (elUnsupportedModal) {
        elUnsupportedModal.classList.remove("hidden");
        if (elModalKernelVer) elModalKernelVer.textContent = props["KERNEL"] || "Unknown";
      }
      return;
    }

    if (elDeviceModel && props["MODEL"]) elDeviceModel.textContent = props["MODEL"];
    if (elCurBattery && props["BATT"]) elCurBattery.textContent = `${props["BATT"]}%`;
    if (elCurTemp && props["TEMP"] && props["TEMP"] !== "--") {
      const t = parseInt(props["TEMP"], 10);
      if (!isNaN(t)) elCurTemp.textContent = `${(t / 10).toFixed(1)}°C`;
    }

    setActiveProfileUI(props["PROF"] || 1);

    updateFeatureRow(rowBypass, toggleBypass, badgeBypass, props["HAS_BYPASS"] === "1", props["VAL_BYPASS"] === "1", "Active", "Off");
    updateFeatureRow(rowFastCharge, toggleFastCharge, badgeFastCharge, props["HAS_FC"] === "1", props["VAL_FC"] === "1", "Active", "Off");
    updateFeatureRow(rowScreenOff, toggleScreenOff, badgeScreenOff, props["HAS_SCREENOFF"] === "1", props["VAL_SCREENOFF"] === "1", "Active", "Off");
    updateFeatureRow(rowWakelock, toggleWakelock, badgeWakelock, props["HAS_WAKELOCK"] === "1", props["VAL_WAKELOCK"] === "1", "Active", "Off");
    updateFeatureRow(rowDynFsync, toggleDynFsync, badgeDynFsync, props["HAS_DYNSYNC"] === "1", props["VAL_DYNSYNC"] === "1", "Active", "Off");

    if (selectTcp && props["VAL_TCP"]) {
      selectTcp.value = props["VAL_TCP"];
      if (badgeTcp) badgeTcp.textContent = props["VAL_TCP"];
    }
  } catch (err) {
    console.error("refreshState error:", err);
  }
}

// Apply & Persist Kernel Settings (Tab 1)
async function applyChanges(silent = false) {
  if (!isKiKernelActive) return;

  const prof = currentProfile;
  const bypass = toggleBypass?.checked ? 1 : 0;
  const fastcharge = toggleFastCharge?.checked ? 1 : 0;
  const screenoff = toggleScreenOff?.checked ? 1 : 0;
  const wakelock = toggleWakelock?.checked ? 1 : 0;
  const dynfsync = toggleDynFsync?.checked ? 1 : 0;
  const tcp = selectTcp ? selectTcp.value : "cubic";

  // Persist, then apply through `ki reload` so boot and WebUI share one code path
  const script = `
    CONF="/sdcard/ki_optimizer.conf"
    [ -f "$CONF" ] || CONF="/data/adb/modules/ki_optimizer/ki_optimizer.conf"
    sed -i -E \\
      -e "s/^KI_PROFILE=.*/KI_PROFILE=${prof}/" \\
      -e "s/^BYPASS_CHARGING=.*/BYPASS_CHARGING=${bypass}/" \\
      -e "s/^SCREEN_ON_FAST_CHARGE=.*/SCREEN_ON_FAST_CHARGE=${fastcharge}/" \\
      -e "s/^FORCE_FAST_CHARGE=.*/FORCE_FAST_CHARGE=${fastcharge}/" \\
      -e "s/^SCREEN_OFF_BATTERY=.*/SCREEN_OFF_BATTERY=${screenoff}/" \\
      -e "s/^WAKELOCK_BLOCKER=.*/WAKELOCK_BLOCKER=${wakelock}/" \\
      -e "s/^DYNAMIC_FSYNC=.*/DYNAMIC_FSYNC=${dynfsync}/" \\
      -e "s/^TCP_CONGESTION=.*/TCP_CONGESTION=\\"${tcp}\\"/" \\
      "$CONF"
    /data/adb/modules/ki_optimizer/bin/ki reload >/dev/null
  `;

  try {
    await exec(script);
    if (!silent) {
      const profName = prof === 0 ? "Battery Saver" : prof === 2 ? "Turbo Gaming" : "Balanced";
      showToast(`${profName} profile & tweaks applied`);
    }
  } catch (err) {
    console.error("applyChanges error:", err);
    showToast("Failed to apply settings. Check kernel support", true);
  }
}

// Event Listeners with Immediate Optimistic Feedback
tabKernel?.addEventListener("click", () => switchTab("panel-kernel"));

cardProf0?.addEventListener("click", () => {
  setProfileInstant(0);
});

cardProf1?.addEventListener("click", () => {
  setProfileInstant(1);
});

cardProf2?.addEventListener("click", () => {
  setProfileInstant(2);
});

// Optimistic Switch Status Badge Updates
toggleBypass?.addEventListener("change", (e) => {
  if (badgeBypass) {
    badgeBypass.textContent = e.target.checked ? "Active" : "Off";
    badgeBypass.classList.toggle("is-off", !e.target.checked);
  }
});

toggleFastCharge?.addEventListener("change", (e) => {
  if (badgeFastCharge) {
    badgeFastCharge.textContent = e.target.checked ? "Active" : "Off";
    badgeFastCharge.classList.toggle("is-off", !e.target.checked);
  }
});

toggleScreenOff?.addEventListener("change", (e) => {
  if (badgeScreenOff) {
    badgeScreenOff.textContent = e.target.checked ? "Active" : "Off";
    badgeScreenOff.classList.toggle("is-off", !e.target.checked);
  }
});

toggleWakelock?.addEventListener("change", (e) => {
  if (badgeWakelock) {
    badgeWakelock.textContent = e.target.checked ? "Active" : "Off";
    badgeWakelock.classList.toggle("is-off", !e.target.checked);
  }
});

toggleDynFsync?.addEventListener("change", (e) => {
  if (badgeDynFsync) {
    badgeDynFsync.textContent = e.target.checked ? "Active" : "Off";
    badgeDynFsync.classList.toggle("is-off", !e.target.checked);
  }
});

selectTcp?.addEventListener("change", (e) => {
  if (badgeTcp) badgeTcp.textContent = e.target.value;
});

btnApply?.addEventListener("click", () => {
  applyChanges(false);
});

// Periodic telemetry poll (Non-blocking, paused during touch/gestures)
setInterval(updateTelemetry, 3500);

// Initialize on Load
document.addEventListener("DOMContentLoaded", () => {
  refreshState();
});
