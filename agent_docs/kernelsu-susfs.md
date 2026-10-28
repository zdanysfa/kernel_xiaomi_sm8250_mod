# KernelSU & SuSFS

## 1. How KernelSU is wired in

```
KernelSU/                      submodule → https://github.com/Baka-SU/BakaSU (branch main)
                               pinned d5e9e025b8b49155f8014684d64c91742b465f65 (UAPI v6)
drivers/kernelsu -> ../KernelSU/kernel     symlink, tracked
drivers/Kconfig:240            source "drivers/kernelsu/Kconfig"   (unconditional)
drivers/Makefile:198           obj-$(CONFIG_KSU) += kernelsu/
```

Fresh clone: `git submodule update --init KernelSU`. Without it the symlink dangles and
Kconfig fails before any compile:

```
drivers/Kconfig:240: can't open file "drivers/kernelsu/Kconfig"
```

`.gitmodules` and `.github/` are whitelisted in `.gitignore` (the kernel's `.*` rule
would hide them otherwise).

## 2. History: why we are on public `main`

- Lineage in `git log -- KernelSU`: KernelSU-Next → ReSukiSU v4.2.0-rc3 → BakaSU.
  `ReSukiSU/ReSukiSU` and `Baka-SU/BakaSU` are the same GitHub repo (same repo id).
- Every pin the previous dev committed (`346e2ddf`, `5b9969cb`, `f08302a3`, `1b1caf48`,
  `ccf76326`, `668380c5`) is **not** on GitHub (HTTP 422, checked 2026-10-28) and there is
  no `Luckyfr1945` fork. They were local patches on top of upstream, never pushed.
- On 2026-10-28 the owner chose public `main` (`d5e9e025`, the base named in
  `8081fc43`). `bash build.sh munch ksu miui` builds with it: SuSFS v2.3.0, 50 min.

Lost with the private pins (from the v1.5 notes; not in the parent tree, verified by grep):
- Manager signatures for FinaSU, MidoriSU, KSUN (KernelSU-Next), RKSU. Public `main`
  with `KSU_MULTI_MANAGER_SUPPORT` accepts only BakaSU, tiann/KernelSU and KOWX712
  (`kernel/manager/apk_sign.c`, `manager_sign.h`).
- FinaSU ioctl compat, dynamic-manager return-code fix, and probably 32-bit userspace
  compat and per-app network isolation (**inferred**).

Where they came from (verified 2026-10-28 by diffing strings of the Telegram v1.5
Universal Image against ours): **`LyraVoid/FinaSU`** (`master`), which has
`kernel/feature/{netisolate,mount_view_filter,avc_spoof}.c`, `kernel/manager/dynamic_manager.c`
and a manager table with KernelSU, KowSU, KernelSU-Next, ReSukiSU, SukiSU, MKSU, RKSU,
xxKSU. The v1.5 Image carries those strings (`netisolate:`, `mount_view_filter:`,
`SET_DYNAMIC_MANAGER_FINASU_24B`, …) and 5 extra manager hashes; ours has none. No
non-KernelSU log string differs, so the parent tree matches v1.5 (inferred).
FinaSU and BakaSU split from tiann/KernelSU at `203cd4d7` (2025-03-02); since then BakaSU
has 2683 commits and FinaSU 1205, so these are ports, not clean cherry-picks. FinaSU's
feature history: `git log 203cd4d7..finasu/master -- kernel/feature/` (11 commits for
netisolate/mount_view_filter/avc_spoof).

To bring them back: fork BakaSU under `zdanysfa`, add them as our own commits, point
`.gitmodules` at the fork, bump the gitlink (owner approval). Take each manager's
expected size/hash from that manager's own kernel source, not from forum posts.

## 3. Updating KernelSU

```bash
git -C KernelSU fetch origin && git -C KernelSU checkout origin/main
git add KernelSU       # bump; commit as "KernelSU: sync to BakaSU main (<short sha>)"
```

Then build `ksu` **and** `nosusfs`, and check the Kconfig symbols `build.sh` sets still
exist (§4). Commit only with the owner's OK.

Symbols `build.sh` sets that `d5e9e025` does not define, so `olddefconfig` drops them
silently (leftovers from SukiSU): `KSU_SUSFS_SUS_NETLINK`, `…_SUS_SU`, `…_SUS_OVERLAYFS`,
`…_ENABLE_AVC_LOG_SPOOFING`, `…_AUTO_ADD_SUS_KSURULES`, `…_AUTO_ADD_SUS_BIND_MOUNT`,
`KSU_KPROBES_HOOK`, `KSU_THRONE_TRACKER_ALWAYS_THREADED`, `KSU_LSM_SECURITY_HOOKS`,
`KSU_ALLOWLIST_WORKAROUND`. Harmless; safe to delete from `build.sh`.

BakaSU's README states non-GKI support, "Manual Hook" for kernels 3.4–6.18 and "SuSFS
Inline Hook"; the tracepoint hook is GKI 2.0 (5.10+) only, which is why `build.sh`
disables `KSU_TRACEPOINT_HOOK` (sourced).

## 4. SuSFS in the parent tree

SuSFS core is **in this repo**, not in `KernelSU/`:
`fs/susfs.c`, `include/linux/susfs.h`, `include/linux/susfs_def.h`.

Hooks guarded by `CONFIG_KSU_SUSFS*` are in:
`fs/{namei,open,readdir,read_write,statfs,exec,namespace,stat,proc_namespace}.c`,
`fs/notify/fdinfo.c`, `fs/proc/{version,cmdline,fd,task_mmu,base}.c`,
`kernel/{kallsyms,sys}.c`, `mm/memory.c`, `security/selinux/avc.c`,
`drivers/input/input.c`.

The `CONFIG_KSU_SUSFS*` symbols are **defined only in `KernelSU/kernel/Kconfig`**.
So the parent-tree hooks and the KernelSU revision must agree. When bumping KernelSU or
SuSFS, diff the symbol list and the hook function signatures on both sides.

## 5. Manager app

Use the manager built by BakaSU CI **for the same commit** as `KernelSU/`, not the GitHub
"Releases" page: `v4.2.0-rc3` there is UAPI 4, the kernel is UAPI 6.

```bash
gh run list -R Baka-SU/BakaSU -w build-manager.yml -b main -L 5   # find run for the pinned sha
gh run download <run-id> -R Baka-SU/BakaSU -n Manager-release     # arm64-v8a APK for munch
```

For `d5e9e025`: run `40109566037`, versionCode `35252`. Its v2 signing cert is size `0x377`,
sha256 `d3469712…21f1df64`, equal to `EXPECTED_SIZE/HASH_BAKASU` (verified 2026-10-28).
Artifacts expire after 90 days. The owner installs the APK; the agent does not.

The UAPI version was bumped to 6, reverted to 5 (`eda2f55b`, for ksud/Zygisk compat),
then 6 again (`8081fc43`). Any UAPI change can break the manager on the phone: flag it in
the commit and CHANGELOG.
