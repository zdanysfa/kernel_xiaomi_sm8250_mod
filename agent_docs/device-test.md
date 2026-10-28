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
