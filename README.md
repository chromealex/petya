<div align="center">

<img src="assets/petya.png" alt="Petya" width="160">

# Петя · Petya

**A voice work assistant for game and app teams that runs on your own computer.**<br>
Say «Петя» — he hears the meeting, reads Slack and Jira, writes the task, and asks before he sends anything.

[![Version](https://img.shields.io/badge/version-0.17.6-2ea043)](docs/HISTORY.md)
[![Tests](https://github.com/chromealex/petya/actions/workflows/test.yml/badge.svg)](https://github.com/chromealex/petya/actions/workflows/test.yml)
[![Platforms](https://img.shields.io/badge/macOS%20%7C%20Windows-lightgrey)](#install)
[![Local models](https://img.shields.io/badge/models-local%20(Ollama%2C%20whisper.cpp)-8957e5)](#privacy)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[**Download for macOS and Windows**](https://github.com/chromealex/petya/releases/latest) · [What's new](docs/HISTORY.md) · [Apps](docs/apps) · [Development](docs/DEVELOPMENT.md)

</div>

---

## What Petya does

Petya lives in the tray and listens for his name. He speaks Russian, understands requests in other languages, and his interface is in Russian or English.

| | |
|---|---|
| 🎙️ **Meetings** | Hears any call (Zoom, Google Meet, Teams or none at all), names who spoke, writes the summary: decisions, open questions and what was *not* discussed. |
| 📋 **Tasks** | Turns a discussion or a spec of any size into Jira or Asana tasks, picks assignees by role and workload, links dependencies — and shows the plan before sending. |
| 💬 **Context** | Reads Slack, Telegram, Discord, mail, Confluence, Notion and your project files, so answers come from your team's real data. |
| 👩‍💻 **Code** | The Programmer writes and fixes code in your repository in a separate branch, runs the tests and shows the diff; Claude Code and Codex can do the same under his plan. |
| 📊 **Dashboards** | Any card — crashes, metrics, sprint, store reviews — goes onto a dashboard that refreshes itself. |
| 🤖 **Agents** | One board shows what Petya, the Programmer, Claude and Codex are working on right now. |
| 🧠 **Learning** | Remembers corrections, recurring commands and team names; adds skills from your files. |

Nothing is sent, created or changed without your confirmation.

## Apps

Petya grows with apps you add from the catalog — 80+ are built in, and you can [write your own](docs/extensions.md) and install it from a folder or a .zip without rebuilding.

| Category | Apps |
|---|---|
| **Team** | Jira · Asana · Sprint planning · Standup · Who knows · Task runner |
| **Meetings** | Meetings · Zoom · Google Meet · Microsoft Teams · Calendar · Meeting prep · Meeting hints |
| **Communication** | Slack · Telegram · Discord · Mail · Player support · Patch notes · Tone check |
| **Docs** | Confluence · Docs · Glossary · Google Sheets · Search everything |
| **Development** | Programmer · Code review · Git · GitHub · Pull requests · Docker · Kubernetes · Server logs · Monitoring · API client · Dependencies · Regex and cron |
| **Game dev** | Unity Editor · Unity layout · Blender · Builds · Build size · Crashes · Firebase Crashlytics · Sentry · Google Play · Store reviews · Profiler · Playtest · Config and balance · Localization · Release checklist · Competitors |
| **Analytics** | Game metrics · A/B tests · Anomalies · AppMetrica · Grafana · Ad revenue · User acquisition · SQL in words · Python · Charts |
| **Personal** | Focus · Reminders · Day journal · Mentor · Time tracking · Subscriptions |
| **Computer** | Files · File search by meaning · Converter · Disk usage · Screenshot → task |
| **Creative** | Artist · Naming |

Each app has a page in [docs/apps](docs/apps).

## Install

**Windows** — download `Petya-Setup.exe` from the [latest release](https://github.com/chromealex/petya/releases/latest) and run it.

**macOS** (Apple Silicon) — download `Petya.dmg` from the [latest release](https://github.com/chromealex/petya/releases/latest), open it and drag Petya into Applications. It is signed and notarized by Apple. On an Intel Mac, build it yourself (see [Development](docs/DEVELOPMENT.md#building)).

On first launch Petya introduces himself, checks the microphone and helps you connect your services. Answers need a local [Ollama](https://ollama.com) model — Petya offers to install one (`qwen3.5:9b` is recommended); a small speech model is built in and a more accurate one downloads in the background on first launch.

## Privacy

- The language model and speech recognition run **on your computer** (Ollama, whisper.cpp, Qwen ASR) and accept only local addresses.
- Tokens are kept in the system keychain (Keychain on macOS, DPAPI on Windows); chats stay in the app's data folder.
- Petya asks before every message, task or change he makes in another service.

## Run from source

```sh
npm ci
npm start
```

Requires Node.js 22.12+. Tests, builds, the code layout and notes on every subsystem are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md); rules for people and agents working on Petya are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) © Alex Silaev. Bundled skill packages keep their own licenses ([anthropics/skills](https://github.com/anthropics/skills), Apache 2.0; [mattpocock/skills](https://github.com/mattpocock/skills), MIT).
