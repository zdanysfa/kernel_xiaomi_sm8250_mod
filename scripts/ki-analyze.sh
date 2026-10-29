#!/bin/bash
# Run the clang static analyzer (scan for null derefs, uninitialized reads,
# divide by zero, leaks) over kernel C files.
#
# Usage: scripts/ki-analyze.sh <file.c>...   (paths relative to the tree root)
#
# Needs a configured out/ (a finished or stopped `bash build.sh munch ...`), so
# the generated headers and one compile command exist. ZyC Clang ships without
# the analyzer, so this uses the host clang with ZyC's flags.
set -e

root=$(cd "$(dirname "$0")/.." && pwd)
clang=${CLANG_ANALYZE:-/usr/bin/clang}
[ $# -gt 0 ] || { echo "usage: $0 <file.c>..." >&2; exit 1; }
cd "$root/out"

# Borrow the flags of a kernel C object built by the target clang (not a
# host tool such as scripts/kconfig).
template=$(find drivers -name '.*.o.cmd' | head -300 \
	| xargs grep -l -E '^cmd_[^ ]+ := clang .*-D__KERNEL__.* -c -o [^ ]+ [^ ]+\.c$' 2>/dev/null | head -1)
[ -n "$template" ] || { echo "no compile command in out/, build first" >&2; exit 1; }
flags=$(head -1 "$template" | sed 's/^[^=]*:= [^ ]*clang //' \
	| sed -E 's/-Wp,-MD,[^ ]+//; s/ -c -o [^ ]+ [^ ]+$//; s/-isystem [^ ]+//' \
	| sed -E 's/-DKBUILD_(BASENAME|MODNAME)=[^ ]+//g; s/-flto[^ ]*//g; s/-fsplit-lto-unit//g' \
)

for f in "$@"; do
	d=$(dirname "$f")
	echo "== $f"
	"$clang" -isystem "$("$clang" -print-resource-dir)/include" $flags \
		-I"../$d" -I"$d" -DKBUILD_BASENAME='"x"' -DKBUILD_MODNAME='"x"' \
		--analyze -Xclang -analyzer-output=text \
		-Xclang -analyzer-checker=core,unix,deadcode \
		-Wno-everything -o /dev/null "../$f" 2>&1 \
		| grep -E "(warning|error):" \
		| grep -v 'include/linux/compiler.h\|asm/pgtable.h' || true
done
