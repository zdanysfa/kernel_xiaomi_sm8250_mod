# Device testing & recovery

The **owner** flashes. Agents prepare the zip, the checklist, and read logs when asked.

## 1. Before flashing (owner)

1. Know the ROM type: AOSP/custom, MIUI/HyperOS, or ColorOS/OxygenOS port. Wrong
   flavour = black screen. A `both` (universal) zip picks automatically.
2. Back up **both** partitions the zip writes, for the active slot:
   `boot` (Image) and `vendor_boot` (dtb). `dtbo` is not touched.
   With root: `adb shell su -c 'dd if=/dev/block/by-name/boot$(getprop ro.boot.slot_suffix) of=/sdcard/boot.img'`
   (same for `vendor_boot`), then `adb pull`. munch is Virtual A/B with `vendor_boot`
   (sourced: LineageOS `device_xiaomi_munch/device.mk` sets `TARGET_IS_VAB := true`;
   `sm8250-common/BoardConfigCommon.mk` then lists `boot`, `vendor_boot` in
   `AB_OTA_PARTITIONS`), so names are `boot_a/_b`, `vendor_boot_a/_b`. Still
   `ls /dev/block/by-name/` once on the real phone.
3. Keep the last known-good Ki-kernel zip on the phone storage and in the PC.
4. Recovery that can flash zips and `adb sideload` (owner's choice).

## 2. After flashing: smoke test

```bash
adb shell uname -r                                   # 4.19.325-Ki-kernel-v1.5 (or new version)
adb shell su -c 'cat /sys/kernel/ki_profile/mode /sys/kernel/ki_profile/active_profile'
adb shell su -c 'dmesg | grep -iE "ki_profile|susfs|kernelsu|ksu" | head -50'
adb shell su -c 'dmesg -l err,crit,alert,emerg'
```

Then the owner checks what the change was about: charging (wall + PPS), screen-off for
a few minutes and wake (Sleep of Death history), a game session with `monitor_perf.sh`,
Wi-Fi/hotspot/USB tethering, root manager detects KernelSU.

## 3. When it breaks

| Symptom | First look |
|---|---|
| Bootloop / stuck at logo | Flash backup `boot`+`vendor_boot` or the known-good zip from recovery. Then read `/sys/fs/pstore/console-ramoops*` after the next good boot (`CONFIG_PSTORE_RAM=y`, `PSTORE_CONSOLE=y`) |
| Black screen, phone alive | Wrong ROM flavour (AOSP vs MIUI) |
| Random reboot / freeze | `/sys/fs/pstore/console-ramoops-0`, `dmesg-ramoops-*` after reboot |
| Root missing | Manager UAPI mismatch; see [kernelsu-susfs.md](kernelsu-susfs.md) §5 |
| Hot / drains | `monitor_perf.sh`, `cat /sys/kernel/ki_profile/*`, compare with previous version |

`/proc/config.gz` is **not** the running config. `kernel/Makefile:136+` embeds a stock
Xiaomi defconfig (`<dev>_stock-defconfig`, "4.19.157 … -perf") to hide the custom kernel,
so `scripts/extract-ikconfig` on our Image returns that stock file too. The real config is
`out/.config` from the build that produced the zip.

Report back with: exact zip name, ROM + version, what was done, and the log output.

## 4. Test protocol for debug and perf builds

`scripts/ki-test.sh` (copy to the phone, run `su -c sh /sdcard/Download/ki-test.sh` in
Termux) does all of the steps below from a menu and writes them to
`/sdcard/ki-test/<phase>/hasil.txt`.

One zip per phase, same phone state (same ROM, apps, brightness, Wi-Fi on), so phases
can be compared. Zip names carry the build type (`-DEBUG`, `-MEMDEBUG`, `-O3`,
`-LTO_FULL`); a release zip has none.

| Phase | Zip | How long | Measures |
|---|---|---|---|
| A | debug, O2 (baseline) | 1 day | smoke, game, overnight drain |
| B | debug, O3 | 1 day | same as A |
| C | debug, O3 + full LTO | 1 day, only if it boots | same as A |
| D | memdebug | 1 to 3 hours, then flash back A | KASAN, kmemleak, lockdep splats |

Per phase: smoke test (§2), one 10 minute session of the same game scene with
`monitor_perf.sh` (average FPS, jank, peak temperature), Geekbench 3 runs, and battery
percentage at night and in the morning with the hours in between. Then collect logs on
the phone into one folder the owner sends over:

```sh
su -c 'T=/sdcard/ki-test/$(date +%m%d-%H%M); mkdir -p $T; uname -a > $T/info.txt; cat /proc/uptime /sys/class/kgsl/kgsl-3d0/max_gpuclk >> $T/info.txt; cat /sys/kernel/ki_profile/* >> $T/info.txt 2>/dev/null; dmesg > $T/dmesg.txt; cat /sys/fs/pstore/console-ramoops-0 > $T/ramoops.txt 2>/dev/null; dumpsys battery > $T/battery.txt; echo $T'
```

Phase D also: `echo scan > /sys/kernel/debug/kmemleak; sleep 5; cat /sys/kernel/debug/kmemleak > $T/kmemleak.txt`.

Kernel-side signs in `dmesg`/`ramoops`: `Call trace`, `soft lockup`, `blocked for more than`,
`workqueue lockup`, `BUG:`, `KASAN:`, `possible circular locking`, `sleeping function
called from invalid context`, `kgsl` faults. App crashes, `servicemanager` retries and
`init: ... restarting` loops point at the ROM unless a kernel trace sits next to them.
