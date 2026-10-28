# Build

How a Ki-kernel zip is produced, what `build.sh` touches, and how to set up a machine.
Source of truth: `build.sh`. If this file and `build.sh` disagree, `build.sh` wins;
fix this file.

## 1. Prerequisites

1. **Three external source dirs in the repo root.** Kconfig `source`s them
   unconditionally, so without them nothing builds, not even `noksu`:

   ```bash
   git submodule update --init KernelSU      # Baka-SU/BakaSU, see kernelsu-susfs.md
   git clone --depth 1 -b v2.2.0 https://github.com/maxsteeel/nomount NoMount
   git clone https://github.com/vc-teahouse/Baseband-guard Baseband-guard
   git -C Baseband-guard checkout 028ff7fd509e2104596da7cc1ef8e6ce2a0c9082
   ```
   These revs match `.github/workflows/build.yml`; bump both together.
2. **Toolchain** at one of these paths (checked in this order):
   - `~/zyc-clang/bin`: ZyCromerZ Clang 16.0.6, used for v1.3–v1.5 releases.
     Releases: `https://github.com/ZyCromerZ/Clang/releases` (tags like
     `16.0.6-20260807-release`). Which exact tag the previous dev used is **unverified**.
   - `~/neutron-clang/bin`
   - `~/proton-clang/proton-clang-20210522/bin`
3. `aarch64-linux-gnu-ld` on `PATH` (ZyC tarball ships GNU binutils; otherwise install
   a cross binutils package). `build.sh` exits if it is missing.
4. Host tools: `gcc` at `/usr/bin/gcc` and `ld.bfd` at `/usr/bin/ld.bfd` (hardcoded),
   `make bc bison flex cpio zip git python openssl` headers (`libssl-dev`/`openssl`).
   On Arch/CachyOS (owner's machine) `bc` and `zip` were missing; failures were
   `bc: command not found` (timeconst.h) and, later, packaging.
   ZyC's `ld.lld` links against `libxml2.so.2`; current Arch ships `libxml2.so.16`, so
   install `libxml2-legacy` (`ld.lld: error while loading shared libraries: libxml2.so.2`).
   Don't symlink `.so.16` to `.so.2`: different ABI. One-shot on Arch:
   `sudo pacman -S --needed bc zip libxml2-legacy`.
5. Network: each build `git clone`s AnyKernel3 (`AstideLabs/AnyKernel3`, branch `kona`).

Resources: ThinLTO link of the AOSP Image is memory-hungry. On 4 cores / 11 GB RAM
expect a long build; if the linker is OOM-killed, try `-j2` or close other apps.
Real numbers for this machine are **unverified** until the first build.

## 2. Command

```bash
bash build.sh <device> [variant] [target_os]
```

| Arg | Values | Effect |
|---|---|---|
| `device` | `munch` (Ki target), other `<dev>_defconfig` names | must match `arch/arm64/configs/<dev>_defconfig` |
| `variant` | `ksu` / empty (default) | KernelSU + SuSFS → tag `KSU+SUSFS` |
| | `nosusfs`, `ksu-only`, `plain`… | KernelSU with manual hooks, no SuSFS → `KSU` |
| | `noksu`, `vanilla`, `none` | no root → `NOKSU` |
| | anything else | warns, falls back to KSU+SuSFS |
| `target_os` | `aosp` (default) | AOSP/custom ROM Image |
| | `miui` | MIUI/HyperOS Image |
| | `coloros` / `oplus` / `oos` / `realme` | same Image as MIUI, packed as ColorOS |
| | `both` / `all` | builds AOSP + MIUI, universal zip (anykernel picks at flash time) |
| | anything else | silently becomes `aosp` |

## 3. What one run does (in order)

1. Pick toolchain, check `aarch64-linux-gnu-ld` and `clang`.
2. `rm -rf out/ anykernel/ build_artifacts/ include/config include/generated arch/*/include/generated .config`.
3. Clone AnyKernel3 into `anykernel/`.
4. `sed` `CONFIG_LOCALVERSION="-Ki-kernel-<KERNEL_VERSION>"` into the **tracked**
   `<dev>_defconfig` (no diff as long as `KERNEL_VERSION` matches).
5. If missing, compile `scripts/selinux/genheaders` to `/tmp/genheaders` and generate
   `security/selinux/flask.h` + `av_permissions.h` (avoids a KernelSU race in parallel make).
6. **AOSP pass**: `make <dev>_defconfig` → `apply_ksu_config` → `apply_droidspaces_config`
   → `olddefconfig` → `make KCFLAGS=-O2 -j$(nproc)`.
7. **MIUI pass** (also for coloros/both): same, plus the MIUI block that enables
   `XIAOMI_MIUI`, `TECHPACK_CAMERA_XIAOMI`, EROFS, and disables LTO, MIUI daemons
   (`MILLET`, `MIGT`, `MI_RECLAIM`, `RTMM`…), debug options.
8. DTBs: copy `gpu_profiles/kona-v2-gpu-extreme.dtsi` over the **tracked**
   `vendor/qcom/kona-v2-gpu.dtsi`, `make dtbs`, take `kona-v2.1.dtb` (fallback: first
   `.dtb` found) as `dtb`.
9. Pack `Image` + `dtb` into `anykernel/kernels/<os>/`, copy
   `anykernel_template/anykernel.sh` in, zip.
10. Zip lands at `./<TAG>_Ki-kernel-<OS>-<ver>_<dev>.zip`, plus a copy in `release/`.

Config precedence: **`build.sh` `scripts/config` lines > defconfig**. When a defconfig
change "does nothing", check whether `build.sh` forces that option.

## 4. Fast checks without a full build

```bash
# Kconfig only (seconds). Needs KernelSU/ populated.
make ARCH=arm64 O=/tmp/kcfg munch_defconfig && grep CONFIG_FOO /tmp/kcfg/.config

# Compile one object after a normal build has populated out/
make ARCH=arm64 O=out CC=clang ... drivers/misc/ki_profile.o
```

Copy the full `MAKE_ARGS` from `build.sh` for the second form, or the object is built
with the wrong compiler.

## 5. Output check

```bash
unzip -l KSU+SUSFS_Ki-kernel-AOSP-v1.5_munch.zip   # expect kernels/aosp/Image, kernels/aosp/dtb, anykernel.sh
strings out/arch/arm64/boot/Image | grep -m1 'Linux version'   # expect 4.19.325-Ki-kernel-v1.5
```
