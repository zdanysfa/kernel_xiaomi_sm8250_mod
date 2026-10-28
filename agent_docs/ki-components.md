# Ki-kernel components

Ki-specific code outside upstream Linux/LineageOS. For history, use
`git log --oneline -- <path>`; the previous dev's subjects are descriptive.

## 1. `ki_profile` (drivers/misc/ki_profile.c, ~1040 lines)

Built in unconditionally (`drivers/misc/Makefile`: `obj-y += ki_profile.o`, no Kconfig
symbol). Header: `include/linux/ki_profile.h`.

Modes (`enum ki_profile_mode`): `0` battery, `1` balanced (default), `2` performance.

User interface:
- `/sys/kernel/ki_profile/`: `mode` (rw), `current_profile`, `available_modes`,
  `active_profile`, `thermal_throttle`, `screen_state` (ro), `screen_off_battery` (rw),
  `max_freq_silver|gold|prime` (rw, per-cluster cap), `reapply` (wo).
- `/proc/ki_profile` (0644).

Behaviour (from comments in the file):
- **Screen-off auto battery**: 5 s after screen off (`KI_SCREEN_OFF_DELAY_MS`), switch to
  battery; restore on unblank via the Mi DRM notifier (`drm_notifier_mi.h`).
- **Thermal auto-guard** (performance mode, screen on): re-arms throttling at die ≥ 85 °C,
  body (`quiet_therm`) ≥ 47 °C or battery ≥ 45 °C; releases at ≤ 75 / 43 / 41 °C; polls
  every 2 s. Constants `KI_GUARD_*` in milli-°C.
- `current_profile_mode` vs `ki_active_mode`: what the user picked vs what is applied
  right now (differs while the screen is off). Read the applied one with
  `ki_get_active_profile()`. Per-mode values live in the `ki_tunes[]` table.

It reaches into other subsystems through functions declared in `ki_profile.h`:
schedutil per-cluster tunables (`sugov_set_cluster_*`), WALT migration
(`sched_set_updown_migrate`, `sched_set_boost`), cpufreq limits
(`ki_cpufreq_set_limits`), Adreno (`kgsl_set_performance_mode`), and VM sysctls
(`vm_swappiness`, `watermark_scale_factor`…). Callers/implementers also live in
`drivers/cpufreq/cpufreq.c`, `drivers/thermal/{cpu_cooling,devfreq_cooling,step_wise}.c`,
`drivers/thermal/qcom/{cpu_isolate,msm_lmh_dcvs}.c`, `fs/kernfs/inode.c`, `fs/proc/inode.c`.

Changing a profile value = performance + battery + heat trade-off. Rule 4 of AGENTS.md §6
applies: measure first.

## 2. Other tunables

| Feature | Source | Node (from module/anykernel scripts) |
|---|---|---|
| Bypass charging, force fast charge, 67 W PPS | `drivers/power/supply/qcom/qpnp-smb5-munch.c`, `smb5-lib-munch.c`, `step-chg-jeita-munch.c` | `/sys/class/power_supply/battery/bypass_charging`, `/proc/bypass_charging`, `/sys/kernel/fast_charge/*` |
| Dynamic Fsync | `drivers/misc/dyn_fsync.c` | `/sys/kernel/dyn_fsync/*` |
| Boeffla wakelock blocker | `drivers/base/power/boeffla_wl_blocker.c` | `/sys/devices/virtual/misc/boeffla_wakelock_blocker/*` |
| MGLRU | `mm/` (upstream backport) | `/sys/kernel/mm/lru_gen/enabled`, `/proc/mglru` (source of the proc node **unverified**) |
| OPlus stubs (ColorOS ports) | `drivers/oplus/` | `oplus_stub_nodes.c` |
| KCAL, DC dimming, dim layer | `techpack/display/` | **unverified**, grep before use |
| GPU UV/OC | `arch/arm64/boot/dts/gpu_profiles/kona-v2-gpu-extreme.dtsi` (683 MHz) | DT, flashed to `vendor_boot` |

Charger and GPU-table changes are hardware-safety code (AGENTS.md §6 rule 3).

## 3. `ki_optimizer_module/` (KernelSU/Magisk module, "Ki-Kernel Settings" v1.4)

- `customize.sh`: install; aborts unless `uname -r` contains `ki-kernel` or the
  `ki_profile` nodes exist. Copies `ki_optimizer.conf` to `/sdcard/`. Stops and cleans
  up the v1.3.x `ki_daemon` if one is running.
- `service.sh`: on boot, link `ki` into the root PATH and run `ki reload`. Node
  permissions stay as the kernel set them (WebUI and `ki` run as root).
- `ki_optimizer.conf`: user config (`KI_PROFILE`, `MGLRU_MODE`, `BYPASS_CHARGING`,
  `SCREEN_ON_FAST_CHARGE`, `FORCE_FAST_CHARGE`, …).
- `bin/ki`: `/system/bin/sh` CLI: `menu|status|json|mglru|bypass|fastcharge|reload|help`.
- `webroot/`: KernelSU WebUI (`index.html`, `app.js`, `style.css`).

How the module zip is packed is **unverified** (not done by `build.sh`).

## 4. `ki_daemon/` (removed in module v1.4)

The Rust auto game turbo daemon was deleted on 2026-10-28. It cached the profile and
overwrote manual WebUI switches, and toggled bypass charging and MGLRU on its own.
History: `git log -- ki_daemon/`.

## 5. `anykernel_template/anykernel.sh`

Runs in recovery. Device check allows `munch munchin alioth aliothin apollo apolloin lmi`.
Steps: detect ROM (MIUI/HyperOS vs AOSP vs OPlus port, logic adopted from e404/re404),
pick `kernels/<os>/Image`, abort if the zip flavour doesn't match the ROM, flash
**Image to `boot`** (adds `e404_args=…` to cmdline), flash **dtb to `vendor_boot`**,
never touch `dtbo`, then set permissions on the Ki nodes.

## 6. `monitor_perf.sh`

Host-side bash over `adb`: display/app FPS, jank, CPU clusters, Adreno 650, temps,
bypass charging, RAM/zRAM, current profile, with interactive toggles. The tool for
AGENTS.md §6 rule 4 measurements.
