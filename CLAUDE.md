# CLAUDE.md

The full project guide lives in **[AGENTS.md](AGENTS.md)**. Read it first. It is
imported below so its contents are always in context.

@AGENTS.md

---

## Non-negotiable rules (full detail in [AGENTS.md §6](AGENTS.md))

1. **The tree is not assumed correct; reasoning is allowed, but labelled.** This kernel
   was written by humans and AI and has bugs. Question existing code. Check what can be
   checked (`grep`/`git`/build). Where it can't, infer from kernel knowledge and say
   **inferred**; when knowledge is missing, find a credible source (kernel docs, LKML,
   upstream commits, vendor/LineageOS trees, papers) and cite it. Then recommend.
2. **The owner flashes, not the agent.** Never run `fastboot flash`, `fastboot boot`,
   `adb reboot`, or any write to the phone's partitions. Build the zip, explain what it
   changes, and hand it over. Same for `git push`, PRs and merges: owner approval each time.
3. **Charging, thermal and voltage are hardware-safety code.** Never raise a current,
   voltage, temperature threshold, GPU/CPU frequency or undervolt table without
   explaining the risk and getting explicit confirmation first.
4. **Debug before changing performance / power / scheduling.** Explain the current
   flow, propose how to measure it on the phone (`monitor_perf.sh`, `dmesg`, sysfs
   reads), and wait for the owner's numbers before editing code.
5. **Don't edit `KernelSU/` from the parent repo.** It is a submodule of `Baka-SU/BakaSU`
   (`main`). See [agent_docs/kernelsu-susfs.md](agent_docs/kernelsu-susfs.md).
6. **A build that compiles is the minimum bar.** Don't call a C change done until
   `bash build.sh munch <variant> <os>` produced a zip, or say plainly that it was not built.

## External sources (as of 2026-10-28)

Kconfig needs three dirs that are not plain files in this repo: `KernelSU/` (submodule,
public BakaSU `main`), `NoMount/`, `Baseband-guard/` (untracked, only symlinks point at
them). Without them `make munch_defconfig` fails for every variant. Setup:
[agent_docs/build.md §1](agent_docs/build.md). The previous dev's KernelSU pins were
never published, so some v1.5 manager features are missing:
[agent_docs/kernelsu-susfs.md](agent_docs/kernelsu-susfs.md).

## Stale files: do not trust as current

`README.md` (liyafe1997-era: SukiSU, Proton Clang, old `build.sh` arguments).
`CHANGELOG.md` is the current release history.
