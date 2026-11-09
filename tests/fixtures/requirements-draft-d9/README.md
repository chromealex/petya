# Petya Andromeda D9: D8 plus the families it still gets wrong

D8 is the group's D (39/54 new, 35/42 v22, 795/801 familiar). Its remaining errors are mostly on-screen renames
(«Название интерфейса показывать», «База не трогать»), a lost file name, invented document names for two copies and
garbled additions to quotes. D9 continues D8 with the D7/D8 recipe (lr 5e-7) on the familiar cases once plus the next
20 training dialogues (21–40, not the ones D8 saw) of those four families. `Train Petya.app` runs `execution.json`
into `~/.petya-train/andromeda-d9`.

## Result

| Set | D9 | D8 | D1 |
|---|---|---|---|
| 54 generated held-out drafts | 39 (25 exact) | 39 (19 exact) | 24 |
| 30 v22 checks + 12 v22 drafts | 28 + 7 | 28 + 7 | 27 + 6 |
| 801 familiar cases | 796 | 795 | 787 |

Gained on held-out: four screen-only cases, exact-name-22, quote-24, two-recipients-38. Lost: open-recipient-34/43
(«в зал N»), cancel-one-9/27, permission-19/37, quote-33 (wrong summary). Not worse than D8 on any set, so D9 is the
group's D since 9 November 2026 (R1-A1-D9), published as `andromeda-d9` on the `models` branch. Reviews are in
`results/*-review.json`, bound to answer hashes.
