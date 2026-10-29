# AGENTS.md — Ki-kernel (kernel_xiaomi_sm8250_mod)

> Operating guide for AI agents and contributors working in this repository.
> Written from the actual tree on branch `stable` at `47177d1e1b8f` (Ki-kernel v1.5),
> verified against `Makefile`, `build.sh`, `arch/arm64/configs/munch_defconfig`,
> `drivers/`, `git log` and the GitHub API on 2026-10-28. Anything that could not be
> confirmed is marked **unverified** inline.

---

## 1. Project description

**Ki-kernel** is a custom Linux kernel for the **POCO F4 / Redmi K40S (codename
`munch`, SoC Snapdragon 870 / SM8250 "kona")**, shipped as an AnyKernel3 flashable zip.
Kernel version **Linux 4.19.325** (`Makefile`), non-GKI, Android vendor kernel.

Lineage (each one is a GitHub fork of the one before it):

| Repo | Role |
|---|---|
| `LineageOS/android_kernel_xiaomi_sm8250` | Base source (LineageOS 22.1), per `README.md` |
| `liyafe1997/kernel_xiaomi_sm8250_mod` | Multi-device mod: battery-1% fix, SukiSU/SuSFS, build script |
| `Luckyfr1945/kernel_xiaomi_sm8250_mod` | **Ki-kernel**, by Lucky Franzacky. munch-focused. Branch `stable` |
| `zdanysfa/kernel_xiaomi_sm8250_mod` | **This repo** (`origin`). Owner wants to continue development independently |

On 2026-10-28 local `stable` is **identical** to `Luckyfr1945:stable` (0 ahead / 0 behind).
The previous developer has ~215 commits on top of liyafe1997 since 2026-09-17.

What Ki-kernel adds on top of the base (details in [agent_docs/ki-components.md](agent_docs/ki-components.md)):
- **Root**: KernelSU (BakaSU fork) + **SuSFS** root-hiding hooks.
- **`ki_profile`**: in-kernel Battery / Balanced / Performance profile switcher with
  screen-off auto-battery and a thermal auto-guard (`drivers/misc/ki_profile.c`).
- Charging work for munch: bypass charging, force fast charge, 67 W PPS
  (`drivers/power/supply/qcom/*-munch.c`).
- Adreno 650 GPU undervolt/overclock DT profile, KCAL, DC dimming, Dynamic Fsync,
  Boeffla wakelock blocker, MGLRU, BBRv3, eBPF backports for Android 16/17, OPlus
  (ColorOS/OxygenOS port) stubs, container (Droidspaces/LXC/Docker) configs.
- A KernelSU **module** (`ki_optimizer_module/`) with WebUI and the `ki` CLI. The Rust
  `ki_daemon` (auto game turbo) was removed in module v1.4.

One kernel source builds three ROM flavours: **AOSP** (custom ROMs), **MIUI/HyperOS**,
**ColorOS/OxygenOS** (same Image as MIUI). Flashing the wrong flavour gives a black
screen (display driver differs).

---

## 2. Tech stack & toolchain

- **Language**: C (kernel, gnu89 + kernel extensions), Device Tree (`.dts/.dtsi`),
  Kconfig, POSIX `sh`/`bash` (build, AnyKernel3, module scripts),
  HTML/JS/CSS (module WebUI).
- **Compiler**: Clang. `build.sh` picks the first that exists:
  `~/zyc-clang/bin` (ZyCromerZ Clang 16.0.6, used for releases) → `~/neutron-clang/bin`
  → `~/proton-clang/proton-clang-20210522/bin`. It also needs
  `aarch64-linux-gnu-ld` on `PATH` (ZyC bundles GNU binutils).
- **Make args** (from `build.sh`): `ARCH=arm64 O=out CC=clang LD=ld.lld AR=llvm-ar …
  HOSTCC=tools/hostcc HOSTLD=/usr/bin/ld.bfd CROSS_COMPILE=aarch64-linux-gnu-
  CROSS_COMPILE_ARM32=arm-linux-gnueabi- CLANG_TRIPLE=aarch64-linux-gnu-`.
  `tools/hostcc` is a wrapper: `exec /usr/bin/gcc -B/usr/bin "$@"`.
- **LTO**: `munch_defconfig` has `CONFIG_LTO_CLANG=y` + `CONFIG_THINLTO=y` (AOSP build).
  The MIUI/ColorOS path forces `LTO_NONE`.
- **Packaging**: AnyKernel3, cloned fresh each build from
  `https://github.com/AstideLabs/AnyKernel3` branch `kona`; our installer script
  `anykernel_template/anykernel.sh` is copied over it.
- **Root**: KernelSU from BakaSU (`Baka-SU/BakaSU`, branch `main`), submodule `KernelSU/`.

Owner's machine on 2026-10-28: CachyOS, 4 cores, 11 GB RAM, `clang`, `ld.lld`,
`adb`, `fastboot`, `cargo`, `python` present. **Missing**: any of the three toolchain
dirs, `aarch64-linux-gnu-ld`, `arm-linux-gnueabi-*`. Setup steps:
[agent_docs/build.md](agent_docs/build.md).

---

## 3. Folder structure (what matters)

Standard Linux layout (`arch/ drivers/ fs/ kernel/ mm/ net/ security/ …`) is upstream
kernel code. Ki-kernel-specific places:

```
kernel_xiaomi_sm8250_mod/
├── build.sh                       # THE build entry point (variant + target OS → zip)
├── anykernel_template/anykernel.sh# Installer logic run in recovery (ROM detection, flash)
├── CHANGELOG.md                   # Release notes (current). README.md is STALE
├── monitor_perf.sh                # Host-side live monitor over adb (FPS, CPU/GPU, temps, profile)
├── tools/hostcc                   # Host gcc wrapper used as HOSTCC
├── KernelSU/                      # submodule → Baka-SU/BakaSU main (§7)
├── drivers/kernelsu -> ../KernelSU/kernel   # symlink; drivers/Kconfig:240 sources it
├── fs/susfs.c, include/linux/susfs*.h       # SuSFS core; hooks spread in fs/ kernel/ mm/ selinux
├── drivers/misc/ki_profile.c      # Profile switcher (+ include/linux/ki_profile.h)
├── drivers/misc/dyn_fsync.c       # Dynamic Fsync
├── drivers/base/power/boeffla_wl_blocker.c
├── drivers/power/supply/qcom/     # qpnp-smb5-munch.c, smb5-lib-munch.c, step-chg-jeita-munch.c
├── drivers/oplus/                 # OPlus stubs for ColorOS/OxygenOS ports
├── techpack/display/              # SDE display (KCAL, DC dimming, dim layer)
├── arch/arm64/configs/munch_defconfig       # Main config (also <device>_defconfig for 12 others)
├── arch/arm64/boot/dts/vendor/qcom/munch-*  # munch device tree
├── arch/arm64/boot/dts/gpu_profiles/        # kona-v2-gpu-{extreme,stock}.dtsi (GPU OPP tables)
└── ki_optimizer_module/           # KernelSU/Magisk module: service.sh, bin/ki (sh), webroot/
```

Other device defconfigs (`alioth apollo cas cmi dagu elish enuma lmi pipa psyche thyme umi`)
still exist, but Ki-kernel work (profiles, charging, DT) targets **munch only**.

---

## 4. How to build, flash, test

Full detail: [agent_docs/build.md](agent_docs/build.md) and
[agent_docs/device-test.md](agent_docs/device-test.md).

```bash
bash build.sh <device> [variant] [target_os]
#   variant   : ksu (default, KSU+SuSFS) | nosusfs (KSU only) | noksu
#   target_os : aosp (default) | miui | coloros | both  (both = universal zip)
bash build.sh munch ksu aosp

# Build type and -O level come from the environment (default release, O2):
#   KI_BUILD : release (no debug options) | debug (lockup detectors, warn only)
#              | memdebug (debug + KASAN, kmemleak, lockdep, atomic-sleep; slow)
#   KI_OPT   : O2 | O3 (passed as KCFLAGS, which overrides Kconfig's -O)
KI_BUILD=debug bash build.sh munch ksu miui
```

GitHub Actions (`.github/workflows/build.yml`, `workflow_dispatch`) takes the same
choices as inputs: `variant`, `target_os`, `build_type`, `opt`. The laptop is slow, so
CI is the usual way to build.

Output: `./<VARIANT>[-DEBUG|-MEMDEBUG][-O3]_Ki-kernel-<OS>-v1.5_munch.zip` (+ copy in
`release/`). The tag in the name is the only way to tell build types apart later.
`build.sh` deletes `out/`, `anykernel/`, `build_artifacts/` and generated headers at
the start of every run, so every build is a full rebuild.

Flashing is done **by the owner**, in recovery, with a backup of the current `boot`
partition and a known-good kernel zip at hand.

---

## 5. Conventions & coding rules

### Kernel C
- Linux kernel coding style: tabs (8 wide), 80-col soft limit, `/* */` comments,
  K&R braces. `.clang-format` is in the root. Check a patch with
  `scripts/checkpatch.pl --no-tree -f <file>` (warnings in old vendor code are normal;
  don't fix unrelated lines).
- Comments explain **why** (e.g. the reason for a threshold), as `ki_profile.c` does.
- Named `#define` for every magic number (frequencies, temps in milli-°C, delays).
- New user-facing knobs go under an existing Ki node (`/sys/kernel/ki_profile/…`) or
  next to the driver they control. Don't add a new top-level node for one value.
- Exported cross-subsystem hooks for `ki_profile` are declared in
  `include/linux/ki_profile.h`; add new ones there, not as ad-hoc `extern`s.
- Config changes: edit `arch/arm64/configs/munch_defconfig` for permanent options.
  Options forced in `build.sh` (`apply_ksu_config`, `apply_droidspaces_config`, the
  MIUI block) override the defconfig, so check there first.
- Before using a `CONFIG_*` symbol, prove it exists:
  `grep -rn "^config FOO$" --include=Kconfig .`

### Kernel C: safety rules

Target: munch (SM8250), Linux 4.19.325, **non-GKI**, everything built in-tree and
mostly built-in (`=y`), ZyC Clang 16. The goal is code that does not freeze,
panic, leak or drain the battery. If a change can't follow a rule, say which one
and why in the commit body.

**Know the context of every function.** Process context may sleep. Atomic context
(IRQ handler, softirq, timer, under a spinlock, preempt or IRQs off) may not: no
`mutex_lock`, `msleep`, `GFP_KERNEL`, `copy_*_user`, `wait_event*` there. Data shared
with an IRQ handler needs `spin_lock_irqsave()` on the process side. Don't hold a
spinlock across anything that can sleep. Notifier callbacks (display, power supply,
cpufreq) often run in atomic or locked context: queue work, don't do the job inline.

**Locks.** One documented order per subsystem, always taken in that order.
`ki_profile_mutex` is taken before any cpufreq `policy->rwsem`. Code holding a
cpufreq lock (e.g. the `scaling_min_freq` store in `cpufreq.c`) may only call
lockless ki_profile readers such as `ki_get_active_profile()`, never anything
that takes `ki_profile_mutex`. Don't wait (`cancel_*_sync`, `flush_work`)
on a work item while holding a lock that work item takes. Lockless reads of shared
flags use `READ_ONCE`/`WRITE_ONCE`; counters use `atomic_t`/`refcount_t`.
`down_write_trylock()` or "skip if busy" is not a deadlock fix: it hides the
inversion and silently drops the update. Find the cycle (lockdep in the memdebug
build, step 4 below) and fix the order.

**Memory.** Check every allocation. `kzalloc` when the struct can reach userspace.
Error paths unwind with `goto`, freeing in reverse order; prefer `devm_*` in drivers.
Balance every get/put (`kref`, `find_user`/`free_uid`, `cpufreq_cpu_get`/`put`). Never
touch a pointer after it is freed or put, including "one more loop" after the walk
that released it. Stack is 16 KB: no big arrays on it. Size math from untrusted
input uses `array_size()` / `check_*_overflow()`.

**Userspace boundary (sysfs, procfs, ioctl, netlink).** Never dereference user
pointers; `copy_from_user`/`copy_to_user` return the bytes NOT copied, check it.
Copy once, then validate the kernel copy. Bound every index and length; for uid
bitmaps cast to `unsigned int` before comparing with the size. Reject unknown
flags. Zero structs before copying them out. Hash pointers (`%p`), never `%px`.
New nodes are `0644` or tighter; a `0666` node must have a reason in a comment,
because any app SELinux lets through can then write or trigger it.

**Errors.** Return negative errno and check every return value, including values
read from hardware (I2C/SPMI gauge and charger reads fail on worn or replacement
parts). Pointer APIs: `IS_ERR()`/`PTR_ERR()`, not only NULL. Initialize anything a
failed read leaves untouched. No `BUG()`/`BUG_ON()`: on a phone that is a reboot.
Use `WARN_ON_ONCE()` and return an error. A value read from hardware is never a
divisor without a zero check.

**Lifecycle.** Teardown undoes init in reverse order: `free_irq()`,
`cancel_work_sync()`, `del_timer_sync()`, `kthread_stop()`, unregister, then free.
`file_operations` set `.owner = THIS_MODULE`.

**Power.** Every wakeup source acquire has a release on every path; prefer
`pm_wakeup_event()` with a timeout. Every runtime PM get has a put. Work that runs
across suspend (system workqueues are not frozen) must expect CPUs offline and
cpufreq/governors not restarted yet, and retry a bounded number of times. No
periodic timers or polling that wake the CPU with the screen off.

**Timeouts.** Never wait on hardware or firmware forever: `readl_poll_timeout()`,
`wait_event_timeout()`, `wait_for_completion_timeout()`, and handle the timeout
path. Keep IRQ top halves tiny. Long loops in process context call
`cond_resched()`. Keep preempt/IRQ-off sections short.

**DMA.** No stack or vmalloc memory for DMA. Check `dma_mapping_error()`, use
`dma_sync_*` around CPU access, `dma_alloc_coherent()` for coherent buffers.

**Logging.** `dev_*`/`pr_*`; `_ratelimited` in hot paths and IRQs. Per-frame,
per-brightness-step or per-transaction messages are `pr_debug`/`DSI_DEBUG`: the log
buffer is 512 KB and noise pushes freeze traces out of it.

**Compiler flags.** `build.sh` passes `KCFLAGS="-O2"`, which the top `Makefile`
appends last (line ~1014), so it overrides any `-O` set by Kconfig. Likewise
`CONFIG_FRAME_POINTER=y` adds `-fno-omit-frame-pointer` after the arch flags. Check
the final command line in `out/<dir>/.<file>.o.cmd` before claiming a flag is in
effect.

**Before calling a C change done** (report what ran and what didn't):
1. `scripts/checkpatch.pl --no-tree -f <file>`: no new warnings on lines you touched.
2. `scripts/ki-analyze.sh <file.c>...` (clang static analyzer, needs a configured
   `out/`): no new findings in the touched functions.
3. `KI_BUILD=debug bash build.sh munch ksu miui` or the GitHub workflow produced a zip.
4. Risky paths (locks, memory, userspace input, suspend) get a session on the
   memdebug build (`build_type=memdebug` / `KI_BUILD=memdebug`: KASAN, kmemleak,
   lockdep, atomic-sleep checks). Read dmesg for any splat.
5. On the phone (owner flashes): `dmesg`, and after a freeze or reboot
   `/sys/fs/pstore/console-ramoops-0`.

### Shell (build.sh, anykernel.sh, module)
- `anykernel.sh` and module scripts run on the phone under recovery/Android `sh`
  (busybox/toybox). No bash-isms there.
- The installer is `anykernel_template/anykernel.sh` (`build.sh` copies it into the
  AnyKernel3 tree). There is no second copy to keep in sync.

---

## 6. ⚠️ Working rules (NON-NEGOTIABLE)

These come from the owner and override generic instincts.

1. **The tree is not assumed correct; reasoning is allowed, but labelled.** The code
   was written by humans and AI and contains mistakes; treat it as a draft to improve,
   not as truth. Three levels of claim:
   - **verified**: checked in this tree (`grep`, `git log`, a build, a phone reading).
   - **inferred**: follows from kernel/Android knowledge and the code around it; say so.
   - **sourced**: knowledge was missing, so a credible reference was looked up and is
     linked (Documentation/, LKML/lore, upstream or CAF/CLO commits, LineageOS device
     trees, vendor docs, peer-reviewed papers). Forum posts only as a lead, not proof.
   Every suggestion ends with a recommendation, not just options. Other kernels (re404,
   e404, UtsavBalar1231, LineageOS) are references to compare against, not ground truth.
2. **The owner flashes.** The agent never writes to the phone: no `fastboot flash/boot`,
   no `dd` over adb, no `adb reboot`. Reading over adb (`adb shell cat`, `dmesg`,
   `getprop`) is fine **after asking once per session**.
3. **Hardware safety.** Charging currents, PPS/voltage, JEITA/thermal thresholds, GPU
   OPP (frequency/voltage) tables and CPU limits can overheat the phone or wear the
   battery. Any change that raises a limit or removes a protection needs: what it
   changes, the worst case, how to revert, and explicit owner confirmation.
4. **Debug before changing perf / power / scheduling.** Explain the current flow first,
   then propose a measurement (`monitor_perf.sh`, `cat /sys/kernel/ki_profile/*`,
   `dmesg`, battery drain over N hours). Wait for numbers, then change code.
5. **Root cause, not symptom.** A freeze/SoD/bootloop gets traced with logs
   (`/sys/fs/pstore/console-ramoops*`, `dmesg`) before a patch. No "disable the
   feature until it stops crashing" without saying that's what it is.
6. **KernelSU lives in its own repo.** Never commit file changes inside `KernelSU/`
   from this repo; change the BakaSU fork, then bump the gitlink.
7. **One logical change per commit.** Build-tested on the variant(s) it affects
   before it is called done. If it was not built, say so.
8. **No AI attribution** in commits, PRs, CHANGELOG or code comments.

---

## 7. Current state & known issues (backlog)

| Area | State | Evidence |
|---|---|---|
| **KernelSU source** | Submodule on public BakaSU `main` `d5e9e025` (UAPI v6) since 2026-10-28; `bash build.sh munch ksu miui` builds. All previous pins (`346e2ddf` … `668380c5`) were the previous dev's local commits, never pushed (HTTP 422). Lost with them: FinaSU/MidoriSU/KSUN/RKSU manager signatures, FinaSU ioctl compat, probably 32-bit compat and per-app network isolation | `git submodule status`, `gh api`, build log |
| **Config step** | `make munch_defconfig` fails for **every** variant while any of the three external dirs is missing | `drivers/Kconfig:240` / `fs/Kconfig:332: can't open file …` (tested 2026-10-28) |
| **Untracked external deps** | Besides `KernelSU/`, two more dirs are reached only via tracked symlinks and are not in git at all: `NoMount/` (`fs/nomount -> ../NoMount/kernel/src`, `CONFIG_NOMOUNT=y`) and `Baseband-guard/` (`security/baseband-guard`, `security/selinux/include/bbg_tracing.h`, `CONFIG_BBG=y`). Sourced: `maxsteeel/nomount` tag `v2.2.0` (matches CHANGELOG), `vc-teahouse/Baseband-guard` (`main`, `028ff7f` on 2026-10-28; exact rev used for v1.5 unknown). Should become `.gitmodules` entries | `git ls-files -s`, `gh api` |
| **Broken symlink (other device)** | `arch/arm64/boot/dts/vendor/xiaomi/pipa-sm8250-overlay.dts -> ../qcom/pipa-sm8250-overlay.dtsi` dangles; not used by munch | `test -e` |
| **Toolchain** | Not installed on owner's machine | §2 |
| **README.md** | Stale (liyafe1997 content: SukiSU 3.2, Proton Clang, `build.sh DEVICE ksu`) | file |
| **build.sh side effects** | `sed`s `CONFIG_LOCALVERSION` into the tracked defconfig; copies `gpu_profiles/kona-v2-gpu-extreme.dtsi` over tracked `vendor/qcom/kona-v2-gpu.dtsi` (already identical today); writes `/tmp/genheaders`; copies the zip to `release/` | `build.sh` |
| **Fork & contribution graph** | `origin` is a fork of `Luckyfr1945/…`; fork commits never count on GitHub. Fork default branch is `android15-lineage22-mod` (256 commits behind `stable`) | `gh repo view` |
| **`anykernel_template/`** | Listed in `.gitignore` but tracked | `.gitignore:155` |
| **OPlus drivers on every ROM** | `CONFIG_OPLUS_PORT`, `NANDSWAP`, `NWPOWER` are in `munch_defconfig`, so they build into AOSP/MIUI too; idle unless ColorOS userspace drives them (inferred) | `munch_defconfig:878-882` |

---

## 8. Quick reference for agents

- **Read first for a task:** `CHANGELOG.md` (what exists), then the `agent_docs/` file
  for the area. `git log --oneline -- <path>` shows why code looks the way it does;
  the previous dev wrote descriptive subjects.
- **Build:** `KI_BUILD=debug bash build.sh munch ksu miui` (owner's ROM), or
  `gh workflow run build.yml --ref <branch> -f variant=ksu -f target_os=miui -f build_type=debug`. Fresh clone: `git submodule update --init` first.
- **Config check without full build:** `make ARCH=arm64 O=/tmp/kcfg munch_defconfig`
  then `grep FOO /tmp/kcfg/.config`.
- **`/proc/config.gz` lies in MIUI builds:** `kernel/Makefile` embeds
  `arch/arm64/configs/munch_stock-defconfig` as the IKCONFIG data when
  `CONFIG_XIAOMI_MIUI=y`, so neither the phone nor `scripts/extract-ikconfig` shows
  the real config. Check a built Image with `grep -a -c '<string from the code>'`.
- **Phone-side state:** `adb shell su -c 'cat /sys/kernel/ki_profile/*'`,
  `adb shell su -c dmesg`, `adb shell uname -r` (expect `4.19.325-Ki-kernel-v1.5`).
- **Don't trust:** `README.md`, `/home/kiki/…` paths.
- **Owner's phone (2026-10-28):** munch on a **HyperOS 4 port**, wants **KSU + SuSFS**.
  Default dev build: `KI_BUILD=debug bash build.sh munch ksu miui` (single-variant MIUI zip skips the
  ROM auto-detection in `anykernel.sh`, so a port with odd build props can't be
  mis-detected as AOSP → black screen). Ask before any flash or push.

---

## 9. Git, commits & contribution graph

### Branches
- Work branch now: `stable` (tracks `origin/stable`). New work goes on a topic branch:
  `fix/`, `feat/`, `perf/`, `refactor/`, `docs/`, `chore/` + short name,
  e.g. `fix/munch-charger-thermal-cutoff`.

### Commit messages
Follow the style already in history, kernel-like `subsystem: summary`:

```
ki_profile: clamp effective mode index on resume
drivers: power: smb5: restore 67W PPS on wall chargers
munch_defconfig: enable USB_CONFIGFS_RNDIS
anykernel: abort when ROM detection is ambiguous
docs: update CHANGELOG for v1.6
```

Body explains **why** and how it was tested (variant built, observed on phone or not).
No `Co-Authored-By: Claude`, no "Generated with", no AI credit.
Identity = global git config (`kkzaadev <zizuukw@gmail.com>`); don't override per repo.

### Release
A release = bump `KERNEL_VERSION` in `build.sh` (it also rewrites `CONFIG_LOCALVERSION`
in the defconfig), add a section at the top of `CHANGELOG.md`, commit as
`release: Ki-kernel vX.Y for POCO F4 (munch)`, build the zips the owner wants with
`build_type=release` (`KI_BUILD=release`, the default). A zip with `-DEBUG` or
`-MEMDEBUG` in its name is never a release.

### Contribution graph (why it matters here)
GitHub counts a commit only if it is on the **default branch of a non-fork repo**.
`zdanysfa/kernel_xiaomi_sm8250_mod` is a fork, so nothing here turns the graph green.
Options (owner decides, agent does not):
1. PR to `Luckyfr1945/kernel_xiaomi_sm8250_mod`, merged with **"Create a merge commit"**
   (counts only if the previous dev merges it).
2. Detach the fork (GitHub support "detach fork") or push to a new non-fork repo, and
   set its default branch to the active branch.

### ⚠️ Owner approval required
Before: any `git push`, any PR, any merge, any history rewrite, bumping the
`KernelSU` gitlink, and any change covered by §6 rule 3.
