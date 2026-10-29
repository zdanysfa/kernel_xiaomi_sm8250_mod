#!/system/bin/sh
# Ki-kernel test helper, run on the phone (Termux):  su -c sh /sdcard/Download/ki-test.sh
#
# Menu-driven, read-only towards the kernel: it reads sysfs/dmesg and writes only
# under /sdcard/ki-test/<phase>/. Protocol: agent_docs/device-test.md §4.
# POSIX sh only (runs under Android mksh/toybox as root).

[ "$(id -u)" = 0 ] || exec su -c "sh '$0'"

BASE=/sdcard/ki-test
FPS_NODE=/sys/devices/platform/soc/ae00000.qcom,mdss_mdp/drm/card0/sde-crtc-0/measured_fps
FPS_PERIOD=/sys/devices/platform/soc/ae00000.qcom,mdss_mdp/drm/card0/sde-crtc-0/fps_periodicity_ms
GPU=/sys/class/kgsl/kgsl-3d0
BATT=/sys/class/power_supply/battery
GAME_DEFAULT_MIN=10
# dmesg lines that point at the kernel rather than the ROM
KERNEL_SIGNS='Call trace|soft lockup|blocked for more than|workqueue lockup|BUG:|KASAN:|kmemleak:|possible circular locking|inconsistent lock state|sleeping function called from invalid context|Unable to handle kernel|Internal error|kgsl.*fault|ppdone_timeout|Kernel panic'

mkdir -p "$BASE"

now() { date '+%Y-%m-%d %H:%M:%S'; }
# SuSFS spoofs uname and /proc/version (fs/proc/version.c); the sysctl copies
# under /proc/sys/kernel are not hooked, so they show the real build
kver() { cat /proc/sys/kernel/osrelease; }
kbuild() { echo "$(kver) $(cat /proc/sys/kernel/version)"; }
rd() { cat "$1" 2>/dev/null; }

pick_phase() {
	echo
	echo "Fase tes:"
	echo "  1) A-O2        debug O2 (pembanding)"
	echo "  2) B-O3        debug O3"
	echo "  3) C-O3-LTO    debug O3 + full LTO"
	echo "  4) D-MEMDEBUG  memdebug (1-3 jam saja)"
	echo "  5) lain        nama sendiri"
	printf "Pilih [1-5]: "; read -r p
	case "$p" in
	1) PHASE=A-O2 ;; 2) PHASE=B-O3 ;; 3) PHASE=C-O3-LTO ;; 4) PHASE=D-MEMDEBUG ;;
	5) printf "Nama fase (tanpa spasi): "; read -r PHASE ;;
	*) echo "Pilihan tidak dikenal"; pick_phase; return ;;
	esac
	echo "$PHASE" > "$BASE/fase"
	mkdir -p "$BASE/$PHASE"
	kbuild > "$BASE/$PHASE/kernel-build.txt"
}

load_phase() {
	PHASE=$(rd "$BASE/fase")
	if [ -z "$PHASE" ]; then pick_phase; return; fi
	D="$BASE/$PHASE"
	# a different kernel build means a new flash: offer to switch phase
	if [ -f "$D/kernel-build.txt" ] && [ "$(kbuild)" != "$(rd "$D/kernel-build.txt")" ]; then
		echo "Kernel berubah sejak fase $PHASE dimulai (flash baru)."
		printf "Ganti fase? [y/n]: "; read -r a
		[ "$a" = y ] && pick_phase
	fi
}

note() { echo "[$(now)] $*" >> "$BASE/$PHASE/hasil.txt"; echo "$*"; }

do_check() {
	D="$BASE/$PHASE"
	{
		echo "== $(now)"
		echo "kernel asli: $(kbuild)"
		echo "uname (dispoof SuSFS kalau aktif): $(uname -a)"
		echo "uptime: $(rd /proc/uptime)"
		echo "max_gpuclk: $(rd $GPU/max_gpuclk)"
		echo "governor: $(rd /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor) $(rd /sys/devices/system/cpu/cpu4/cpufreq/scaling_governor) $(rd /sys/devices/system/cpu/cpu7/cpufreq/scaling_governor)"
		for f in /sys/kernel/ki_profile/*; do [ -f "$f" ] && echo "ki_profile/${f##*/}: $(rd "$f")"; done
		echo "millet.netlink: $(getprop ro.millet.netlink)"
		echo "rom: $(getprop ro.build.display.id) / $(getprop ro.build.version.incremental)"
	} >> "$D/cek.txt"
	# ramoops is from the PREVIOUS boot: keep it now before it is overwritten
	for f in /sys/fs/pstore/*; do
		[ -f "$f" ] && cp "$f" "$D/pstore-$(date +%m%d-%H%M)-${f##*/}.txt"
	done
	gpu=$(rd $GPU/max_gpuclk)
	case "$gpu" in 683000000) gpu_s="OC 683 MHz" ;; '') gpu_s="tidak terbaca" ;; *) gpu_s="stok $((gpu / 1000000)) MHz" ;; esac
	# millet_monitor prints this once when its netlink sockets work; crash loops repeat other lines
	if dmesg | grep -q 'MILLET_EPOLL: all .* sockets registered'; then mil=OK; else mil="belum jalan ($(dmesg | grep -c MILLET_EPOLL) baris)"; fi
	ksan=$(dmesg | grep -c 'KernelAddressSanitizer initialized')
	sig=$(dmesg | grep -cE "$KERNEL_SIGNS")
	note "[cek] $(kver) | GPU $gpu_s | millet $mil | KASAN $ksan | tanda kernel di dmesg: $sig"
	[ "$ksan" -gt 0 ] && [ "$PHASE" != D-MEMDEBUG ] && echo "PERINGATAN: ini build MEMDEBUG tapi fase = $PHASE"
	ls /sys/fs/pstore/ 2>/dev/null | grep -q . && echo "Ada pstore (jejak crash boot sebelumnya), sudah disalin."
	[ "$mil" = OK ] || dmesg | grep MILLET_EPOLL | tail -3
	[ "$sig" -gt 0 ] && dmesg | grep -E "$KERNEL_SIGNS" | tail -5
	return 0
}

# Thermal zones whose type starts with cpu- or gpu (resolved once per run)
temp_zones() {
	for z in /sys/class/thermal/thermal_zone*; do
		case "$(rd "$z/type")" in cpu-*|gpu*) echo "$z/temp" ;; esac
	done
}

do_game() {
	D="$BASE/$PHASE"
	printf "Durasi menit [%s]: " "$GAME_DEFAULT_MIN"; read -r m
	[ -z "$m" ] && m=$GAME_DEFAULT_MIN
	case "$m" in *[!0-9]*|0) echo "Angka menit tidak valid"; return ;; esac
	printf "Nama game + adegan (mis. genshin-mondstadt): "; read -r g
	[ -z "$g" ] && g=game
	echo 1000 > "$FPS_PERIOD" 2>/dev/null
	zones=$(temp_zones)
	csv="$D/game-$(date +%m%d-%H%M)-$g.csv"
	echo "detik,fps,gpu_mhz,gpu_busy,cpu_max_c,batt_c,arus_ma,cpu4_khz,cpu7_khz" > "$csv"
	echo "Buka game sekarang. Mulai merekam dalam 15 detik, $m menit, layar jangan dimatikan."
	sleep 15
	echo "Merekam... (Ctrl+C untuk berhenti lebih awal)"
	total=$((m * 60)); i=0
	trap 'total=0' INT
	while [ "$i" -lt "$total" ]; do
		read -r _ fps _ 2>/dev/null < "$FPS_NODE" || fps=0
		gf=$(rd $GPU/devfreq/cur_freq); gb=$(rd $GPU/gpu_busy_percentage)
		tmax=0
		for t in $zones; do read -r v 2>/dev/null < "$t" && [ "$v" -gt "$tmax" ] 2>/dev/null && tmax=$v; done
		bt=$(rd $BATT/temp); cur=$(rd $BATT/current_now)
		c4=$(rd /sys/devices/system/cpu/cpu4/cpufreq/scaling_cur_freq)
		c7=$(rd /sys/devices/system/cpu/cpu7/cpufreq/scaling_cur_freq)
		echo "$i,$fps,$(( ${gf:-0} / 1000000 )),${gb%% *},$((tmax / 1000)),$(( ${bt:-0} / 10 )),$(( ${cur:-0} / 1000 )),$c4,$c7" >> "$csv"
		i=$((i + 1))
		[ $((i % 60)) = 0 ] && echo "  $((i / 60))/$m menit, fps sekarang $fps"
		sleep 1
	done
	trap - INT
	# fps 0 or 1 = screen idle/menu, left out of the average
	s=$(awk -F, 'NR>1 && $2>1 {n++; f+=$2; if(min==""||$2<min)min=$2}
		NR>1 {if($5>tc)tc=$5; if($6>tb)tb=$6; g+=$3; a+=$7; k++}
		END {if(!n){print "tidak ada data fps"; exit}
		printf "fps rata %.1f min %.1f | suhu cpu/gpu max %dC baterai max %dC | gpu rata %d MHz | arus rata %d mA | %d detik",
		f/n, min, tc, tb, g/k, a/k, k}' "$csv")
	note "[game] $g: $s"
	echo "Data per detik: $csv"
}

do_geekbench() {
	printf "Skor single-core: "; read -r sc
	printf "Skor multi-core: "; read -r mc
	note "[geekbench] single $sc multi $mc"
}

# boottime - monotonic = time spent in suspend (deep sleep)
sleep_secs() {
	bt=$(awk '{print int($1)}' /proc/uptime)
	mono=$(awk '/^now at/ {print int($3 / 1000000000); exit}' /proc/timer_list 2>/dev/null)
	[ -n "$mono" ] && echo $((bt - mono)) || echo -1
}

# Below this the phone may hit 0% before morning and the drain can't be measured
NIGHT_MIN_LEVEL=50

do_night() {
	D="$BASE/$PHASE"; st="$D/malam.state"
	if [ ! -f "$st" ]; then
		lv=$(rd $BATT/capacity)
		[ "$(rd $BATT/status)" = Charging ] && { echo "Cabut charger dulu, lalu pilih menu ini lagi."; return; }
		if [ "${lv:-0}" -lt "$NIGHT_MIN_LEVEL" ]; then
			echo "Baterai $lv%, di bawah $NIGHT_MIN_LEVEL%: bisa habis sebelum pagi."
			printf "Tetap mulai? [y/n]: "; read -r a
			[ "$a" = y ] || return
		fi
		echo "$(date +%s) $lv $(rd $BATT/charge_counter) $(sleep_secs) $(rd /proc/sys/kernel/random/boot_id)" > "$st"
		note "[malam mulai] baterai $lv%"
		echo "Matikan layar, tidur. Besok pagi pilih menu ini lagi, sebelum dicas."
		return
	fi
	read -r t0 l0 q0 s0 b0 < "$st"
	t1=$(date +%s); l1=$(rd $BATT/capacity); q1=$(rd $BATT/charge_counter); s1=$(sleep_secs)
	# boot_id changes on every boot: the phone died or rebooted overnight
	if [ "$(rd /proc/sys/kernel/random/boot_id)" != "$b0" ]; then
		up=$(awk '{print int($1)}' /proc/uptime)
		boot_at=$(date -d "@$((t1 - up))" '+%H:%M' 2>/dev/null || echo "?")
		note "[malam BATAL] HP mati/restart sejak mulai $(date -d "@$t0" '+%H:%M' 2>/dev/null) ($l0%), nyala lagi $boot_at | alasan: $(getprop sys.boot.reason) | bootreason: $(getprop ro.boot.bootreason)"
		echo "Alasan 'shutdown,battery' = baterai habis (bukan crash). 'kernel_panic' atau 'watchdog' = crash kernel: jalankan menu 1 lalu 6."
		rm -f "$st"
		return
	fi
	dt=$((t1 - t0))
	[ "$dt" -lt 600 ] && { echo "Belum 10 menit sejak mulai, batal."; return; }
	if [ "${l1:-0}" -gt "$l0" ] || [ "$(rd $BATT/status)" = Charging ]; then
		note "[malam BATAL] HP sempat dicas ($l0% -> $l1%), ukur ulang malam berikutnya"
		rm -f "$st"
		return
	fi
	mah=$(( (q0 - q1) / 1000 ))
	if [ "$s0" -ge 0 ] && [ "$s1" -ge 0 ]; then deep=$(( (s1 - s0) * 100 / dt ))%; else deep="?"; fi
	s=$(awk -v l0="$l0" -v l1="$l1" -v dt="$dt" -v mah="$mah" 'BEGIN {
		h = dt / 3600; printf "%d%% -> %d%% dalam %.1f jam = %.2f%%/jam, %d mAh (%.0f mA rata)",
		l0, l1, h, (l0 - l1) / h, mah, mah / h }')
	note "[malam] $s | deep sleep $deep dari waktu itu"
	rm -f "$st"
}

do_note() {
	echo "Tulis kejadian (freeze, lag, layar telat nyala, reboot, panas...). Enter untuk simpan:"
	read -r n
	[ -n "$n" ] && note "[catatan] $n"
}

do_logs() {
	D="$BASE/$PHASE"; L="$D/log-$(date +%m%d-%H%M)"
	mkdir -p "$L"
	dmesg > "$L/dmesg.txt"
	dmesg | grep -E "$KERNEL_SIGNS" > "$L/tanda-kernel.txt"
	logcat -b crash -d > "$L/crash-rom.txt" 2>/dev/null
	cp /proc/meminfo "$L/meminfo.txt"; cp /proc/slabinfo "$L/slabinfo.txt" 2>/dev/null
	dumpsys battery > "$L/battery.txt"
	cat /sys/kernel/ki_profile/* > "$L/ki_profile.txt" 2>/dev/null
	if [ -d /sys/kernel/debug ] && [ ! -e /sys/kernel/debug/kmemleak ]; then
		mount -t debugfs none /sys/kernel/debug 2>/dev/null
	fi
	if [ -e /sys/kernel/debug/kmemleak ]; then
		echo "Scan kmemleak (sekitar 1 menit)..."
		echo scan > /sys/kernel/debug/kmemleak; sleep 60; echo scan > /sys/kernel/debug/kmemleak
		cat /sys/kernel/debug/kmemleak > "$L/kmemleak.txt"
		note "[kmemleak] $(grep -c unreferenced "$L/kmemleak.txt") objek bocor tercatat"
	fi
	note "[log] $L | tanda kernel: $(wc -l < "$L/tanda-kernel.txt") baris | crash ROM: $(grep -c 'FATAL\|crash' "$L/crash-rom.txt" 2>/dev/null)"
}

do_pack() {
	out=/sdcard/Download/ki-test-$(date +%m%d-%H%M).tar.gz
	tar -czf "$out" -C /sdcard ki-test 2>/dev/null || { out=${out%.gz}; tar -cf "$out" -C /sdcard ki-test; }
	echo "Kirim file ini: $out ($(du -h "$out" | cut -f1))"
}

do_summary() {
	for d in "$BASE"/*/; do
		[ -f "$d/hasil.txt" ] || continue
		echo; echo "===== ${d%/}" | sed "s|$BASE/||"; cat "$d/hasil.txt"
	done
}

load_phase
while :; do
	echo
	echo "=== Ki-test | fase: $PHASE | $(kver) ==="
	echo " 1) Cek setelah flash/boot"
	echo " 2) Rekam game (FPS, suhu, GPU)"
	echo " 3) Isi skor Geekbench"
	echo " 4) Baterai semalam (mulai / selesai)"
	echo " 5) Catat kejadian"
	echo " 6) Ambil log"
	echo " 7) Lihat semua hasil"
	echo " 8) Bungkus semua untuk dikirim"
	echo " 9) Ganti fase"
	echo " 0) Keluar"
	printf "Pilih: "; read -r c
	case "$c" in
	1) do_check ;; 2) do_game ;; 3) do_geekbench ;; 4) do_night ;; 5) do_note ;;
	6) do_logs ;; 7) do_summary ;; 8) do_pack ;; 9) pick_phase ;; 0) exit 0 ;;
	*) echo "Pilihan tidak dikenal" ;;
	esac
done
